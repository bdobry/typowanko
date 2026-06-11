/**
 * Odds fetcher using api-football.com (api-sports.io).
 *
 * Pro plan: no CORS restrictions, no daily request cap issues.
 * The API key is configured via the VITE_API_FOOTBALL_KEY build-time env variable
 * (set as a GitHub Actions secret) and can be overridden per-browser in Settings.
 *
 * Two-step approach:
 *   1. GET /fixtures?date=&league=1&season=2026 — find fixture ID by team names and date
 *   2. GET /odds?fixture={id}                   — fetch odds, extract "Exact Score" market
 */

const API_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1; // FIFA World Cup
const WC_SEASON = 2026;

export const ODDS_API_KEY_STORAGE_KEY = 'apiFootballKey';

/** Returns the effective API key: localStorage override or build-time env var. */
export function getApiFootballKey(): string {
  return (
    localStorage.getItem(ODDS_API_KEY_STORAGE_KEY)?.trim() ||
    (import.meta.env.VITE_API_FOOTBALL_KEY as string | undefined) ||
    ''
  );
}

export interface CorrectScoreOdd {
  homeScore: number;
  awayScore: number;
  odd: number;
}

// Map of API team name variants → canonical name used in fixtures
const TEAM_NAME_ALIASES: Record<string, string> = {
  'bosnia and herzegovina': 'Bosnia & Herzegovina',
  "cote d'ivoire": 'Ivory Coast',
  "côte d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'cape verde islands': 'Cape Verde',
  'cape verde': 'Cape Verde',
  'united states': 'USA',
  'usa': 'USA',
  'curacao': 'Curaçao',
  'curaçao': 'Curaçao',
  'korea republic': 'South Korea',
  'republic of korea': 'South Korea',
  'republic of ireland': 'Ireland',
  'new zealand': 'New Zealand',
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
 * Parse a correct-score outcome value from api-football.com, e.g.:
 *   "Home 2:1"  → { homeScore: 2, awayScore: 1 }
 *   "Away 0:1"  → { homeScore: 0, awayScore: 1 }
 *   "Draw 1:1"  → { homeScore: 1, awayScore: 1 }
 *   "2:1"       → { homeScore: 2, awayScore: 1 }  (some bookmakers omit the prefix)
 */
function parseOutcome(value: string): { homeScore: number; awayScore: number } | null {
  const scoreMatch = value.match(/(\d+)[:\-](\d+)/);
  if (!scoreMatch) return null;

  const n1 = parseInt(scoreMatch[1], 10);
  const n2 = parseInt(scoreMatch[2], 10);

  // Scores outside the app's supported range (0–5)
  if (n1 > 5 || n2 > 5) return null;

  // The score is always expressed as home:away regardless of the "Home"/"Away"/"Draw" prefix
  return { homeScore: n1, awayScore: n2 };
}

const CORRECT_SCORE_BET_NAMES = ['exact score', 'correct score'];

function isCorrectScoreBet(name: string): boolean {
  const lower = name.toLowerCase();
  return CORRECT_SCORE_BET_NAMES.some((n) => lower.includes(n));
}

async function apiGet(url: URL, apiKey: string): Promise<unknown> {
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
  const data = (await res.json()) as any;
  // api-football returns errors in a dedicated field even on HTTP 200
  if (data?.errors && Object.keys(data.errors).length > 0) {
    const firstError = Object.values(data.errors)[0];
    throw new Error(String(firstError));
  }
  return data;
}

export async function fetchCorrectScoreOdds(
  homeTeam: string,
  awayTeam: string,
  date: string, // YYYY-MM-DD
  apiKey: string,
): Promise<CorrectScoreOdd[]> {
  // Step 1: resolve fixture ID from date + team names
  const fixturesUrl = new URL(`${API_BASE}/fixtures`);
  fixturesUrl.searchParams.set('date', date);
  fixturesUrl.searchParams.set('league', String(WC_LEAGUE_ID));
  fixturesUrl.searchParams.set('season', String(WC_SEASON));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixturesData = (await apiGet(fixturesUrl, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixturesList: any[] = fixturesData.response ?? [];

  const fixtureEntry = fixturesList.find(
    (f) =>
      teamsMatch(f.teams?.home?.name ?? '', homeTeam) &&
      teamsMatch(f.teams?.away?.name ?? '', awayTeam),
  );

  if (!fixtureEntry) {
    throw new Error(
      `Nie znaleziono meczu "${homeTeam} vs ${awayTeam}" na ${date}. ` +
        `Mecz może jeszcze nie być dostępny w API lub nazwy drużyn się różnią.`,
    );
  }

  const fixtureId: number = fixtureEntry.fixture.id;

  // Step 2: fetch odds for that fixture and extract "Exact Score" market
  const oddsUrl = new URL(`${API_BASE}/odds`);
  oddsUrl.searchParams.set('fixture', String(fixtureId));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oddsData = (await apiGet(oddsUrl, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oddsResponse: any[] = oddsData.response ?? [];

  const bestOdds = new Map<string, number>();

  for (const entry of oddsResponse) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const bookmaker of (entry.bookmakers ?? []) as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const bet of (bookmaker.bets ?? []) as any[]) {
        if (!isCorrectScoreBet(bet.name)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const outcome of (bet.values ?? []) as any[]) {
          const parsed = parseOutcome(outcome.value ?? '');
          if (!parsed) continue;
          const { homeScore, awayScore } = parsed;
          const odd = parseFloat(outcome.odd);
          if (isNaN(odd) || odd <= 0) continue;
          const key = `${homeScore}:${awayScore}`;
          if (odd > (bestOdds.get(key) ?? 0)) {
            bestOdds.set(key, odd);
          }
        }
      }
    }
  }

  if (bestOdds.size === 0) {
    throw new Error(
      `Znaleziono mecz (ID: ${fixtureId}), ale brak kursów "Exact Score". ` +
        `Kursy mogą być niedostępne przed meczem lub wymagają wyższego planu API.`,
    );
  }

  return Array.from(bestOdds.entries()).map(([key, odd]) => {
    const [h, a] = key.split(':').map(Number);
    return { homeScore: h, awayScore: a, odd };
  });
}
