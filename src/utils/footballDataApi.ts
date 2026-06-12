import { getApiFootballKey, ODDS_API_KEY_STORAGE_KEY } from './oddsApi';
import { toStoredTeamName } from './displayNames';

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

// Map of API team name variants → canonical names used in fixtures
const TEAM_NAME_ALIASES: Record<string, string> = {
  'united states': 'USA',
  'usa': 'USA',
  "korea republic": 'South Korea',
  'republic of korea': 'South Korea',
  "cote d'ivoire": 'Ivory Coast',
  "côte d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'cape verde': 'Cape Verde',
  'cape verde islands': 'Cape Verde',
  'bosnia and herzegovina': 'Bosnia & Herzegovina',
  'bosnia & herzegovina': 'Bosnia & Herzegovina',
  'curacao': 'Curaçao',
  'curaçao': 'Curaçao',
  'new zealand': 'New Zealand',
  'republic of ireland': 'Ireland',
};

function normalizeTeamName(name: string): string {
  const canonicalName = toStoredTeamName(name);
  const lower = canonicalName.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] ?? canonicalName;
}

function teamsMatch(apiName: string, fixtureName: string): boolean {
  const a = normalizeTeamName(apiName).toLowerCase();
  const b = normalizeTeamName(fixtureName).toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
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
  const url = new URL(`${API_BASE}/fixtures`);
  url.searchParams.set('date', date);
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

  if (!entry) {
    throw new Error(
      `Nie znaleziono meczu "${homeTeam} vs ${awayTeam}" na ${date}. ` +
        `Mecz może jeszcze nie być dostępny w API lub nazwy drużyn się różnią.`,
    );
  }

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
