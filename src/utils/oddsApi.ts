/**
 * Odds fetcher using api-football.com (api-sports.io).
 *
 * Pro plan: no CORS restrictions, no daily request cap issues.
 * The API key is configured via the VITE_API_FOOTBALL_KEY build-time env variable
 * (set as a GitHub Actions secret) and can be overridden per-browser in Settings.
 *
 * Three-step approach:
 *   1. Resolve Correct Score bet ID from /odds/bets
 *   2. Resolve Bet365 bookmaker ID from /odds/bookmakers
 *   3. GET /fixtures?date=&league=1&season=2026 — find fixture ID by team names and date
 *   4. GET /odds?fixture={id}&bet={betId}&bookmaker={bookmakerId} — fetch Bet365 Correct Score odds only
 */

const API_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1; // FIFA World Cup
const WC_SEASON = 2026;

export const ODDS_API_KEY_STORAGE_KEY = 'apiFootballKey';
export const CORRECT_SCORE_BET_ID_KEY = 'correctScoreBetId';
export const DEFAULT_BOOKMAKER_ID_KEY = 'bet365BookmakerId';
export const DEFAULT_BOOKMAKER_NAME = 'Bet365';

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
  bookmakerId: number;
  bookmakerName: string;
  market: string;
  fetchedAt: number;
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

/**
 * Resolve the Correct Score bet ID from API-FOOTBALL /odds/bets endpoint.
 * Caches the result in localStorage to avoid repeated API calls.
 */
export async function resolveCorrectScoreBetId(apiKey: string): Promise<number> {
  // Check cache first
  const cached = localStorage.getItem(CORRECT_SCORE_BET_ID_KEY);
  if (cached) {
    return parseInt(cached, 10);
  }

  const url = new URL(`${API_BASE}/odds/bets`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet(url, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bets: any[] = data.response ?? [];

  const correctScoreBet = bets.find(
    (bet) => bet.name?.toLowerCase().includes('correct score') || bet.name?.toLowerCase().includes('exact score')
  );

  if (!correctScoreBet?.id) {
    throw new Error(
      'Nie znaleziono rynku "Correct Score" w API-FOOTBALL. ' +
      'Sprawdź, czy Twój plan API ma dostęp do kursów bukmacherskich.'
    );
  }

  const betId = correctScoreBet.id;
  localStorage.setItem(CORRECT_SCORE_BET_ID_KEY, String(betId));
  console.log(`✓ Resolved Correct Score bet ID: ${betId}`);
  return betId;
}

/**
 * Resolve the Bet365 bookmaker ID from API-FOOTBALL /odds/bookmakers endpoint.
 * Caches the result in localStorage to avoid repeated API calls.
 */
export async function resolveBet365BookmakerId(apiKey: string): Promise<number> {
  // Check cache first
  const cached = localStorage.getItem(DEFAULT_BOOKMAKER_ID_KEY);
  if (cached) {
    return parseInt(cached, 10);
  }

  const url = new URL(`${API_BASE}/odds/bookmakers`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet(url, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookmakers: any[] = data.response ?? [];

  const bet365 = bookmakers.find((b) => b.name?.toLowerCase() === 'bet365');

  if (!bet365?.id) {
    throw new Error(
      '⚠️ Bet365 bookmaker not found in API-FOOTBALL bookmakers list. ' +
      'Aplikacja wymaga bukmachera Bet365 dla kursów Correct Score.'
    );
  }

  const bookmakerId = bet365.id;
  localStorage.setItem(DEFAULT_BOOKMAKER_ID_KEY, String(bookmakerId));
  console.log(`✓ Resolved Bet365 bookmaker ID: ${bookmakerId}`);
  return bookmakerId;
}

/**
 * Get cached configuration IDs. Returns null if not cached.
 */
export function getCachedConfigIds(): { betId: number; bookmakerId: number } | null {
  const betId = localStorage.getItem(CORRECT_SCORE_BET_ID_KEY);
  const bookmakerId = localStorage.getItem(DEFAULT_BOOKMAKER_ID_KEY);
  
  if (!betId || !bookmakerId) {
    return null;
  }
  
  return {
    betId: parseInt(betId, 10),
    bookmakerId: parseInt(bookmakerId, 10),
  };
}

export async function fetchCorrectScoreOdds(
  homeTeam: string,
  awayTeam: string,
  date: string, // YYYY-MM-DD
  apiKey: string,
): Promise<CorrectScoreOdd[]> {
  // Step 1: Resolve configuration IDs
  console.log('🔧 Resolving API configuration...');
  const betId = await resolveCorrectScoreBetId(apiKey);
  const bookmakerId = await resolveBet365BookmakerId(apiKey);

  if (!betId) {
    throw new Error('CORRECT_SCORE_BET_ID is missing. Cannot fetch odds.');
  }
  if (!bookmakerId) {
    throw new Error('DEFAULT_BOOKMAKER_ID is missing. Cannot fetch odds.');
  }

  console.log(`✓ Using bet ID: ${betId}, bookmaker ID: ${bookmakerId} (${DEFAULT_BOOKMAKER_NAME})`);

  // Step 2: Resolve fixture ID from date + team names
  console.log(`🔍 Finding fixture for ${homeTeam} vs ${awayTeam} on ${date}...`);
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
  console.log(`✓ Found fixture ID: ${fixtureId}`);

  // Step 3: Fetch odds with specific bet and bookmaker parameters
  const oddsUrl = new URL(`${API_BASE}/odds`);
  oddsUrl.searchParams.set('fixture', String(fixtureId));
  oddsUrl.searchParams.set('bet', String(betId));
  oddsUrl.searchParams.set('bookmaker', String(bookmakerId));

  console.log(`📡 Fetching odds: ${oddsUrl.toString()}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oddsData = (await apiGet(oddsUrl, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oddsResponse: any[] = oddsData.response ?? [];

  const results: CorrectScoreOdd[] = [];
  const fetchedAt = Date.now();

  // Parse odds from Bet365 only
  for (const entry of oddsResponse) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const bookmaker of (entry.bookmakers ?? []) as any[]) {
      // Verify it's Bet365 (should be the only one due to query param, but double-check)
      if (bookmaker.id !== bookmakerId) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const bet of (bookmaker.bets ?? []) as any[]) {
        // Verify it's Correct Score (should be the only one due to query param, but double-check)
        if (bet.id !== betId) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const outcome of (bet.values ?? []) as any[]) {
          const parsed = parseOutcome(outcome.value ?? '');
          if (!parsed) continue;

          const { homeScore, awayScore } = parsed;
          const odd = parseFloat(outcome.odd);
          if (isNaN(odd) || odd <= 0) continue;

          results.push({
            homeScore,
            awayScore,
            odd,
            bookmakerId,
            bookmakerName: DEFAULT_BOOKMAKER_NAME,
            market: 'correct_score',
            fetchedAt,
          });
        }
      }
    }
  }

  if (results.length === 0) {
    console.warn(`⚠️ No Correct Score odds found from ${DEFAULT_BOOKMAKER_NAME} for fixture ${fixtureId}`);
    throw new Error(
      `Znaleziono mecz (ID: ${fixtureId}), ale ${DEFAULT_BOOKMAKER_NAME} nie zwrócił kursów "Correct Score". ` +
        `Kursy mogą być niedostępne przed meczem lub ${DEFAULT_BOOKMAKER_NAME} nie oferuje kursów dla tego meczu.`,
    );
  }

  console.log(`✓ Fetched ${results.length} Correct Score odds from ${DEFAULT_BOOKMAKER_NAME}`);
  return results;
}
