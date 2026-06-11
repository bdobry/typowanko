const API_BASE = 'https://api.football-data.org/v4';
const WC_2026_COMPETITION_ID = 2000;

export const FOOTBALL_DATA_KEY_STORAGE_KEY = 'footballDataApiKey';

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  status: string;
}

/** Returns the effective API key: localStorage override or build-time env var. */
export function getFootballDataApiKey(): string {
  return (
    localStorage.getItem(FOOTBALL_DATA_KEY_STORAGE_KEY)?.trim() ||
    (import.meta.env.VITE_FOOTBALL_DATA_API_KEY as string | undefined) ||
    ''
  );
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
  const lower = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[lower] ?? name;
}

function teamsMatch(apiName: string, fixtureName: string): boolean {
  const a = normalizeTeamName(apiName).toLowerCase();
  const b = normalizeTeamName(fixtureName).toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Fetch the final score for a specific match from football-data.org.
 *
 * Docs: https://docs.football-data.org/general/v4/index.html
 * Free tier: 10 req/min. Sign up at https://www.football-data.org/
 *
 * @param homeTeam  Fixture home team name (as stored in the app)
 * @param awayTeam  Fixture away team name
 * @param date      Match date in YYYY-MM-DD format
 * @param apiKey    football-data.org API key
 */
export async function fetchMatchResult(
  homeTeam: string,
  awayTeam: string,
  date: string,
  apiKey: string,
): Promise<MatchResult> {
  const url = new URL(`${API_BASE}/competitions/${WC_2026_COMPETITION_ID}/matches`);
  url.searchParams.set('dateFrom', date);
  url.searchParams.set('dateTo', date);

  const res = await fetch(url.toString(), {
    headers: { 'X-Auth-Token': apiKey },
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches: any[] = data.matches ?? [];

  const match = matches.find(
    (m) =>
      teamsMatch(m.homeTeam?.name ?? '', homeTeam) &&
      teamsMatch(m.awayTeam?.name ?? '', awayTeam),
  );

  if (!match) {
    throw new Error(
      `Nie znaleziono meczu "${homeTeam} vs ${awayTeam}" na ${date}. ` +
        `Mecz może jeszcze nie być dostępny w API lub nazwy drużyn się różnią.`,
    );
  }

  const status: string = match.status ?? 'UNKNOWN';

  if (status !== 'FINISHED') {
    throw new Error(
      `Mecz "${homeTeam} vs ${awayTeam}" ma status: ${status}. Wynik dostępny tylko po zakończeniu meczu.`,
    );
  }

  const homeScore: number = match.score?.fullTime?.home;
  const awayScore: number = match.score?.fullTime?.away;

  if (homeScore == null || awayScore == null) {
    throw new Error(`Brak wyniku dla meczu "${homeTeam} vs ${awayTeam}".`);
  }

  return { homeScore, awayScore, status };
}
