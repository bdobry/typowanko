import { getApiFootballKey, ODDS_API_KEY_STORAGE_KEY } from './oddsApi';
import { teamsMatch } from './teamMatching';
import type { FixtureWinner } from '../db';

const API_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1; // FIFA World Cup
const WC_SEASON = 2026;

// Re-export so that external code that imported these from this module still works.
export { getApiFootballKey as getFootballDataApiKey, ODDS_API_KEY_STORAGE_KEY as FOOTBALL_DATA_KEY_STORAGE_KEY };

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  status: string;
  winnerTeam?: FixtureWinner;
}

type ApiScorePart = {
  home?: number | null;
  away?: number | null;
};

type ApiFixtureEntry = {
  teams?: {
    home?: { name?: string; winner?: boolean | null };
    away?: { name?: string; winner?: boolean | null };
  };
  goals?: ApiScorePart;
  score?: {
    halftime?: ApiScorePart;
    fulltime?: ApiScorePart;
    extratime?: ApiScorePart;
    penalty?: ApiScorePart;
  };
  fixture?: { status?: { short?: string } };
};

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function fixtureSearchDates(date: string): string[] {
  return [date, addUtcDays(date, 1), addUtcDays(date, -1)];
}

function hasScore(score: ApiScorePart | undefined): score is { home: number; away: number } {
  return typeof score?.home === 'number' && typeof score.away === 'number';
}

function scoreWinner(score: ApiScorePart | undefined): FixtureWinner | undefined {
  if (!hasScore(score) || score.home === score.away) return undefined;
  return score.home > score.away ? 'home' : 'away';
}

function teamsWinner(teams: ApiFixtureEntry['teams']): FixtureWinner | undefined {
  if (teams?.home?.winner === true && teams.away?.winner === false) return 'home';
  if (teams?.away?.winner === true && teams.home?.winner === false) return 'away';
  return undefined;
}

function matchWinner(entry: ApiFixtureEntry): FixtureWinner | undefined {
  return (
    teamsWinner(entry.teams) ??
    scoreWinner(entry.score?.penalty) ??
    scoreWinner(entry.score?.extratime) ??
    scoreWinner(entry.goals) ??
    scoreWinner(entry.score?.fulltime)
  );
}

function reverseWinner(winner: FixtureWinner | undefined): FixtureWinner | undefined {
  if (winner === 'home') return 'away';
  if (winner === 'away') return 'home';
  return undefined;
}

/**
 * Fetch the regular-time score and final winner for a specific match from v3.football.api-sports.io.
 *
 * Docs: https://www.api-football.com/documentation-v3
 * Pro plan: no CORS restrictions.
 *
 * @param homeTeam  Fixture home team name (as stored in the app)
 * @param awayTeam  Fixture away team name
 * @param date      Match date in YYYY-MM-DD format
 * @param apiKey    api-sports.io API key
 */
export async function fetchMatchResult(
  homeTeam: string,
  awayTeam: string,
  date: string,
  apiKey: string,
): Promise<MatchResult> {
  for (const searchDate of fixtureSearchDates(date)) {
    const url = new URL(`${API_BASE}/fixtures`);
    url.searchParams.set('date', searchDate);
    url.searchParams.set('league', String(WC_LEAGUE_ID));
    url.searchParams.set('season', String(WC_SEASON));
    url.searchParams.set('timezone', 'UTC');

    const res = await fetch(url.toString(), {
      headers: { 'x-apisports-key': apiKey },
    });

    if (!res.ok) {
      let message = `API error ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) message = body.message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const data = await res.json() as {
      errors?: Record<string, unknown>;
      response?: ApiFixtureEntry[];
      message?: string;
    };

    if (data?.errors && Object.keys(data.errors).length > 0) {
      const firstError = Object.values(data.errors)[0];
      throw new Error(String(firstError));
    }

    const fixtures = data.response ?? [];

    const entry = fixtures.find((f) => {
      const apiHomeTeam = f.teams?.home?.name ?? '';
      const apiAwayTeam = f.teams?.away?.name ?? '';
      const directMatch = teamsMatch(apiHomeTeam, homeTeam) && teamsMatch(apiAwayTeam, awayTeam);
      const reversedMatch = teamsMatch(apiHomeTeam, awayTeam) && teamsMatch(apiAwayTeam, homeTeam);
      return directMatch || reversedMatch;
    });

    if (!entry) continue;

    const apiHomeTeam = entry.teams?.home?.name ?? '';
    const apiAwayTeam = entry.teams?.away?.name ?? '';
    const directMatch = teamsMatch(apiHomeTeam, homeTeam) && teamsMatch(apiAwayTeam, awayTeam);
    const reversedMatch = teamsMatch(apiHomeTeam, awayTeam) && teamsMatch(apiAwayTeam, homeTeam);
    const reversed = !directMatch && reversedMatch;

    const status: string = entry.fixture?.status?.short ?? 'UNKNOWN';
    const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];

    if (!FINISHED_STATUSES.includes(status)) {
      throw new Error(
        `Mecz "${homeTeam} vs ${awayTeam}" ma status: ${status}. Wynik dostępny tylko po zakończeniu meczu.`,
      );
    }

    const regularTimeScore = hasScore(entry.score?.fulltime) ? entry.score.fulltime : entry.goals;
    const homeScore = regularTimeScore?.home;
    const awayScore = regularTimeScore?.away;

    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
      throw new Error(`Brak wyniku po regulaminowym czasie dla meczu "${homeTeam} vs ${awayTeam}".`);
    }

    const apiWinner = matchWinner(entry);
    const winnerTeam = reversed ? reverseWinner(apiWinner) : apiWinner;

    return {
      homeScore: reversed ? awayScore : homeScore,
      awayScore: reversed ? homeScore : awayScore,
      status,
      winnerTeam,
    };
  }

  throw new Error(
    `Nie znaleziono meczu "${homeTeam} vs ${awayTeam}" na ${date}. ` +
      `Mecz może jeszcze nie być dostępny w API lub nazwy drużyn się różnią.`,
  );
}
