const API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT_KEY = 'soccer_fifa_world_cup';

export const ODDS_API_KEY_STORAGE_KEY = 'oddsApiKey';

export interface CorrectScoreOdd {
  homeScore: number;
  awayScore: number;
  odd: number;
}

// Map of API team name variants → canonical name used in fixtures
const TEAM_NAME_ALIASES: Record<string, string> = {
  'bosnia and herzegovina': 'Bosnia & Herzegovina',
  "cote d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'cape verde islands': 'Cape Verde',
  'united states': 'USA',
  'curacao': 'Curaçao',
  'korea republic': 'South Korea',
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
 * Parse a correct-score outcome name like:
 *   "Mexico 1-0 South Africa"  → { homeScore: 1, awayScore: 0 }  (Mexico = homeTeam)
 *   "South Africa 1-0 Mexico"  → { homeScore: 0, awayScore: 1 }  (South Africa = awayTeam)
 *   "Draw 1-1"                 → { homeScore: 1, awayScore: 1 }
 */
function parseOutcome(
  name: string,
  homeTeam: string,
  awayTeam: string,
): { homeScore: number; awayScore: number } | null {
  const scoreMatch = name.match(/(\d+)-(\d+)/);
  if (!scoreMatch) return null;

  const n1 = parseInt(scoreMatch[1], 10);
  const n2 = parseInt(scoreMatch[2], 10);

  const lower = name.toLowerCase();

  if (lower.startsWith('draw')) {
    return { homeScore: n1, awayScore: n2 };
  }

  // Text before the score indicates which team leads
  const beforeScore = name.substring(0, name.search(/\d+-\d+/)).trim();

  if (teamsMatch(beforeScore, homeTeam)) {
    // Home team is the one with n1 goals
    return { homeScore: n1, awayScore: n2 };
  }
  if (teamsMatch(beforeScore, awayTeam)) {
    // Away team is the one with n1 goals
    return { homeScore: n2, awayScore: n1 };
  }

  // Fallback: try matching against the full outcome string
  if (lower.includes(homeTeam.toLowerCase().slice(0, 4))) {
    return { homeScore: n1, awayScore: n2 };
  }
  if (lower.includes(awayTeam.toLowerCase().slice(0, 4))) {
    return { homeScore: n2, awayScore: n1 };
  }

  return null;
}

async function apiGet(url: URL): Promise<unknown> {
  const res = await fetch(url.toString());
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
  return res.json();
}

/**
 * Fetch correct-score odds from The Odds API for a specific fixture.
 *
 * Uses a two-step approach:
 *   1. GET /sports/{sport}/events — list upcoming events (no odds, low quota cost)
 *   2. GET /sports/{sport}/events/{id}/odds?markets=correct_score — odds for the
 *      matched event only (cheaper than fetching all events at once)
 *
 * Sign up at https://the-odds-api.com/ to get a free API key.
 *
 * Returns the best (highest) decimal odds across all returned bookmakers
 * for each distinct home:away score.
 */
export async function fetchCorrectScoreOdds(
  homeTeam: string,
  awayTeam: string,
  date: string, // YYYY-MM-DD
  apiKey: string,
): Promise<CorrectScoreOdd[]> {
  // Step 1: list events to find the event ID for this fixture
  const eventsUrl = new URL(`${API_BASE}/sports/${SPORT_KEY}/events`);
  eventsUrl.searchParams.set('apiKey', apiKey);
  eventsUrl.searchParams.set('dateFormat', 'iso');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = (await apiGet(eventsUrl)) as any[];

  const event = events.find((e) => {
    const eventDate = (e.commence_time as string).substring(0, 10);
    return (
      eventDate === date &&
      teamsMatch(e.home_team, homeTeam) &&
      teamsMatch(e.away_team, awayTeam)
    );
  });

  if (!event) {
    throw new Error(
      `No event found for "${homeTeam} vs ${awayTeam}" on ${date}. ` +
        `The match may not yet be listed by the API, or the team names differ.`,
    );
  }

  // Step 2: fetch correct-score odds for that specific event
  const oddsUrl = new URL(`${API_BASE}/sports/${SPORT_KEY}/events/${event.id}/odds`);
  oddsUrl.searchParams.set('apiKey', apiKey);
  oddsUrl.searchParams.set('regions', 'eu,uk');
  oddsUrl.searchParams.set('markets', 'correct_score');
  oddsUrl.searchParams.set('dateFormat', 'iso');
  oddsUrl.searchParams.set('oddsFormat', 'decimal');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventWithOdds = (await apiGet(oddsUrl)) as any;

  // Aggregate best odds per score across all bookmakers
  const bestOdds = new Map<string, number>();

  for (const bookmaker of eventWithOdds.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      if (market.key !== 'correct_score') continue;
      for (const outcome of market.outcomes ?? []) {
        const parsed = parseOutcome(outcome.name, homeTeam, awayTeam);
        if (!parsed) continue;
        const { homeScore, awayScore } = parsed;
        // Only keep scores in 0-5 range (what the app supports)
        if (homeScore > 5 || awayScore > 5) continue;
        const key = `${homeScore}:${awayScore}`;
        const existing = bestOdds.get(key) ?? 0;
        if (outcome.price > existing) {
          bestOdds.set(key, outcome.price);
        }
      }
    }
  }

  if (bestOdds.size === 0) {
    throw new Error(
      `Event found but no correct-score odds returned. ` +
        `The "correct_score" market may not be available for this match yet, ` +
        `or your API plan does not include it.`,
    );
  }

  return Array.from(bestOdds.entries()).map(([key, odd]) => {
    const [h, a] = key.split(':').map(Number);
    return { homeScore: h, awayScore: a, odd };
  });
}
