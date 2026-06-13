import { getApiFootballKey, ODDS_API_KEY_STORAGE_KEY } from './oddsApi';
import { teamsMatch } from './teamMatching';

const API_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1; // FIFA World Cup
const WC_SEASON = 2026;

// Re-export so that external code that imported these from this module still works.
export { getApiFootballKey as getFootballDataApiKey, ODDS_API_KEY_STORAGE_KEY as FOOTBALL_DATA_KEY_STORAGE_KEY };

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  status: string;
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function fixtureSearchDates(date: string): string[] {
  return [date, addUtcDays(date, 1), addUtcDays(date, -1)];
}

/**
 * Fetch the final score for a specific match from v3.football.api-sports.io.
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    if (data?.errors && Object.keys(data.errors).length > 0) {
      const firstError = Object.values(data.errors)[0];
      throw new Error(String(firstError));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fixtures: any[] = data.response ?? [];

    const entry = fixtures.find(
      (f) =>
        teamsMatch(f.teams?.home?.name ?? '', homeTeam) &&
        teamsMatch(f.teams?.away?.name ?? '', awayTeam),
    );

    if (!entry) continue;

    const status: string = entry.fixture?.status?.short ?? 'UNKNOWN';
    const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];

    if (!FINISHED_STATUSES.includes(status)) {
      throw new Error(
        `Mecz "${homeTeam} vs ${awayTeam}" ma status: ${status}. Wynik dostępny tylko po zakończeniu meczu.`,
      );
    }

    const homeScore: number = entry.goals?.home;
    const awayScore: number = entry.goals?.away;

    if (homeScore == null || awayScore == null) {
      throw new Error(`Brak wyniku dla meczu "${homeTeam} vs ${awayTeam}".`);
    }

    return { homeScore, awayScore, status };
  }

  throw new Error(
    `Nie znaleziono meczu "${homeTeam} vs ${awayTeam}" na ${date}. ` +
      `Mecz może jeszcze nie być dostępny w API lub nazwy drużyn się różnią.`,
  );
}
