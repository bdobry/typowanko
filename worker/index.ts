type D1Result<T = Record<string, unknown>> = {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
};

type Env = {
  DB: D1Database;
  API_FOOTBALL_KEY?: string;
};

type SnapshotPayload = {
  schemaVersion?: number;
  snapshot?: unknown;
  baseRevision?: number;
};

type PlayerBetPayload = {
  fixtureId?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
};

type SnapshotFixtureRecord = {
  id?: unknown;
  round?: unknown;
  group?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  date?: unknown;
  utcTime?: unknown;
  venue?: unknown;
  status?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  num?: unknown;
};

type SnapshotOddRecord = {
  id?: number;
  fixtureId?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  odd?: unknown;
};

type SnapshotBetRecord = {
  id?: number;
  playerId?: unknown;
  fixtureId?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  updatedAt?: number;
  updatedBy?: 'host' | 'player';
};

type SnapshotMatchOddRecord = {
  id?: number;
  fixtureId?: unknown;
  homeOdd?: unknown;
  drawOdd?: unknown;
  awayOdd?: unknown;
};

type SnapshotScoreRecord = {
  id?: number;
  playerId?: unknown;
  fixtureId?: unknown;
  points?: unknown;
  betHomeScore?: unknown;
  betAwayScore?: unknown;
  resultHomeScore?: unknown;
  resultAwayScore?: unknown;
  odd?: unknown;
  pointType?: 'exact' | 'outcome';
};

type LeagueRow = {
  id: string;
  host_code_hash: string;
  viewer_code_hash: string;
  snapshot_json: string;
  schema_version: number;
  revision: number;
  created_at: number;
  updated_at: number;
};

type PlayerAccessRow = {
  player_id: string;
  player_code_hash: string;
  active: number;
};

type AuthContext =
  | { role: 'host' | 'viewer'; code: string }
  | { role: 'player'; code: string; playerId: string };

type RawCredential = {
  role: 'host' | 'viewer' | 'player';
  code: string;
};

type SnapshotRecord = {
  schemaVersion?: number;
  exportedAt?: number;
  autoResultsLastCheckedAt?: number;
  players: Array<{ id?: unknown; name?: unknown; lastOnlineAt?: unknown }>;
  fixtures: SnapshotFixtureRecord[];
  odds: SnapshotOddRecord[];
  bets: SnapshotBetRecord[];
  scores: SnapshotScoreRecord[];
  matchOdds: SnapshotMatchOddRecord[];
};

type MatchResultLookup =
  | { kind: 'finished'; homeScore: number; awayScore: number; status: string; matchedDate: string }
  | { kind: 'not_finished'; status: string; matchedDate: string }
  | { kind: 'missing_score'; status: string; matchedDate: string }
  | { kind: 'not_found' };

type ResultRefreshFixtureIssue = {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  reason: 'api_error' | 'not_found' | 'not_finished' | 'missing_score';
  status?: string;
  message?: string;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-typowanko-role,x-typowanko-code',
};

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const WC_LEAGUE_ID = 1;
const WC_SEASON = 2026;
const BET_LOCK_MESSAGE = 'Mecz już się rozpoczął. Zakładów nie można już zmieniać.';
const AUTO_RESULT_REFRESH_MIN_INTERVAL_MS = 3 * 60 * 1000;
const RESULT_FETCH_AFTER_KICKOFF_MS = 2 * 60 * 60 * 1000;
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(status: number, message: string) {
  return jsonResponse({ error: message }, { status });
}

function randomToken(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashCode(leagueId: string, role: string, code: string) {
  const input = new TextEncoder().encode(`${leagueId}:${role}:${code.toUpperCase()}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return toHex(digest);
}

function readCredential(request: Request): RawCredential | null {
  const rawRole = request.headers.get('x-typowanko-role')?.toLowerCase();
  const code = request.headers.get('x-typowanko-code')?.toUpperCase();
  if ((rawRole !== 'host' && rawRole !== 'viewer' && rawRole !== 'player') || !code) {
    return null;
  }
  return { role: rawRole, code };
}

function validateSnapshot(snapshot: unknown): snapshot is SnapshotRecord {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const record = snapshot as Record<string, unknown>;
  return ['players', 'fixtures', 'odds', 'bets', 'scores', 'matchOdds'].every((key) =>
    Array.isArray(record[key]),
  );
}

async function readJson(request: Request): Promise<SnapshotPayload> {
  try {
    return (await request.json()) as SnapshotPayload;
  } catch {
    throw new Error('Invalid JSON body.');
  }
}

function buildCombinedId(role: 'H' | 'V' | 'P', leagueId: string, code: string) {
  return `TYP-${role}-${leagueId}-${code}`;
}

async function getLeague(env: Env, leagueId: string) {
  return env.DB.prepare('SELECT * FROM leagues WHERE id = ?').bind(leagueId).first<LeagueRow>();
}

function playerIdsFromSnapshot(snapshot: SnapshotRecord) {
  return snapshot.players
    .map((player) => (typeof player.id === 'string' ? player.id : null))
    .filter((id): id is string => Boolean(id));
}

// Temporary guard for cloud leagues created before migration 0002 fixed this fixture date.
function applyCapeVerdeSaudiArabiaDateCorrection(snapshot: SnapshotRecord) {
  let changed = false;
  for (const fixture of snapshot.fixtures) {
    if (
      fixture.id === 'H5' &&
      fixture.homeTeam === 'Cape Verde' &&
      fixture.awayTeam === 'Saudi Arabia' &&
      fixture.date === '2026-06-26' &&
      fixture.utcTime === '00:00'
    ) {
      fixture.date = '2026-06-27';
      changed = true;
    }
  }
  return changed;
}

function timestampValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function fixtureKickoffMs(fixture: SnapshotFixtureRecord) {
  if (typeof fixture.date !== 'string') return Number.POSITIVE_INFINITY;
  const time = typeof fixture.utcTime === 'string' ? fixture.utcTime : '23:59';
  const timestamp = Date.parse(`${fixture.date}T${time}:00Z`);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function hasFixtureStarted(fixture: SnapshotFixtureRecord, now: number) {
  return now >= fixtureKickoffMs(fixture);
}

function canFetchFixtureResult(fixture: SnapshotFixtureRecord, now: number) {
  return now >= fixtureKickoffMs(fixture) + RESULT_FETCH_AFTER_KICKOFF_MS;
}

function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function fixtureSearchDates(date: string) {
  return [date, addUtcDays(date, 1), addUtcDays(date, -1)];
}

const TEAM_NAME_ALIASES: Record<string, string> = {
  'bosnia and herzegovina': 'bosnia and herzegovina',
  'bosnia herzegovina': 'bosnia and herzegovina',
  'cabo verde': 'cape verde',
  'cape verde': 'cape verde',
  'cape verde islands': 'cape verde',
  'congo dr': 'dr congo',
  'cote d ivoire': 'ivory coast',
  'czech republic': 'czech republic',
  'czechia': 'czech republic',
  'curacao': 'curacao',
  'democratic republic of congo': 'dr congo',
  'dr congo': 'dr congo',
  'ir iran': 'iran',
  'ivory coast': 'ivory coast',
  'korea republic': 'south korea',
  'new zealand': 'new zealand',
  'republic of ireland': 'ireland',
  'republic of korea': 'south korea',
  'rsa': 'south africa',
  'south africa': 'south africa',
  'turkey': 'turkey',
  'turkiye': 'turkey',
  'united states of america': 'usa',
  'united states': 'usa',
  'usa': 'usa',
};

function normalizeTeamName(name: string) {
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return TEAM_NAME_ALIASES[normalized] ?? normalized;
}

function teamsMatch(apiName: string, fixtureName: string) {
  const apiTeam = normalizeTeamName(apiName);
  const fixtureTeam = normalizeTeamName(fixtureName);
  return apiTeam === fixtureTeam || apiTeam.includes(fixtureTeam) || fixtureTeam.includes(apiTeam);
}

function scoreOutcome(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function apiFootballGet(url: URL, apiKey: string) {
  const response = await fetch(url.toString(), {
    headers: { 'x-apisports-key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const data = await response.json() as {
    errors?: Record<string, unknown>;
    response?: unknown[];
  };
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(String(Object.values(data.errors)[0]));
  }
  return data.response ?? [];
}

async function fetchMatchResultFromApi(
  homeTeam: string,
  awayTeam: string,
  date: string,
  apiKey: string,
): Promise<MatchResultLookup> {
  for (const searchDate of fixtureSearchDates(date)) {
    const url = new URL(`${API_FOOTBALL_BASE}/fixtures`);
    url.searchParams.set('date', searchDate);
    url.searchParams.set('league', String(WC_LEAGUE_ID));
    url.searchParams.set('season', String(WC_SEASON));
    url.searchParams.set('timezone', 'UTC');

    const entries = await apiFootballGet(url, apiKey);
    for (const entry of entries as Array<Record<string, unknown>>) {
      const teams = entry.teams as { home?: { name?: string }; away?: { name?: string } } | undefined;
      const goals = entry.goals as { home?: number; away?: number } | undefined;
      const fixture = entry.fixture as { status?: { short?: string } } | undefined;
      const apiHomeTeam = teams?.home?.name ?? '';
      const apiAwayTeam = teams?.away?.name ?? '';
      const directMatch = teamsMatch(apiHomeTeam, homeTeam) && teamsMatch(apiAwayTeam, awayTeam);
      const reversedMatch = teamsMatch(apiHomeTeam, awayTeam) && teamsMatch(apiAwayTeam, homeTeam);
      if (!directMatch && !reversedMatch) continue;

      const status = fixture?.status?.short ?? 'UNKNOWN';
      if (!FINISHED_STATUSES.has(status)) {
        return { kind: 'not_finished', status, matchedDate: searchDate };
      }
      if (goals?.home == null || goals?.away == null) {
        return { kind: 'missing_score', status, matchedDate: searchDate };
      }

      return {
        kind: 'finished',
        homeScore: reversedMatch ? goals.away : goals.home,
        awayScore: reversedMatch ? goals.home : goals.away,
        status,
        matchedDate: searchDate,
      };
    }
  }

  return { kind: 'not_found' };
}

function recalculateFixtureScores(snapshot: SnapshotRecord, fixture: SnapshotFixtureRecord) {
  if (typeof fixture.id !== 'string') return;
  const resultHomeScore = numericValue(fixture.homeScore);
  const resultAwayScore = numericValue(fixture.awayScore);
  if (resultHomeScore == null || resultAwayScore == null) return;

  const exactOdd = snapshot.odds.find(
    (odd) =>
      odd.fixtureId === fixture.id &&
      odd.homeScore === resultHomeScore &&
      odd.awayScore === resultAwayScore,
  );
  const exactOddValue = numericValue(exactOdd?.odd) ?? 0;
  const matchOdd = snapshot.matchOdds.find((odd) => odd.fixtureId === fixture.id);
  const resultOutcome = scoreOutcome(resultHomeScore, resultAwayScore);
  const nextScores: SnapshotScoreRecord[] = snapshot.scores.filter(
    (score) => score.fixtureId !== fixture.id,
  );

  for (const bet of snapshot.bets) {
    if (bet.fixtureId !== fixture.id || typeof bet.playerId !== 'string') continue;
    if (!isSupportedScore(bet.homeScore) || !isSupportedScore(bet.awayScore)) continue;

    const isExact = bet.homeScore === resultHomeScore && bet.awayScore === resultAwayScore;
    if (isExact && exactOddValue > 0) {
      nextScores.push({
        playerId: bet.playerId,
        fixtureId: fixture.id,
        points: exactOddValue,
        betHomeScore: bet.homeScore,
        betAwayScore: bet.awayScore,
        resultHomeScore,
        resultAwayScore,
        odd: exactOddValue,
        pointType: 'exact',
      });
      continue;
    }

    if (!isExact && matchOdd) {
      const betOutcome = scoreOutcome(bet.homeScore, bet.awayScore);
      if (betOutcome !== resultOutcome) continue;
      const outcomeOdd =
        resultOutcome === 'home'
          ? numericValue(matchOdd.homeOdd)
          : resultOutcome === 'draw'
          ? numericValue(matchOdd.drawOdd)
          : numericValue(matchOdd.awayOdd);
      if (outcomeOdd == null || outcomeOdd <= 0) continue;
      nextScores.push({
        playerId: bet.playerId,
        fixtureId: fixture.id,
        points: outcomeOdd,
        betHomeScore: bet.homeScore,
        betAwayScore: bet.awayScore,
        resultHomeScore,
        resultAwayScore,
        odd: outcomeOdd,
        pointType: 'outcome',
      });
    }
  }

  snapshot.scores = nextScores;
}

function markPlayerOnline(snapshot: SnapshotRecord, playerId: string, now: number) {
  const player = snapshot.players.find((entry) => entry.id === playerId);
  if (!player) return false;
  player.lastOnlineAt = Math.max(timestampValue(player.lastOnlineAt), now);
  return true;
}

function mergePlayerPresence(snapshot: SnapshotRecord, cloudSnapshot: SnapshotRecord) {
  const cloudPresence = new Map(
    cloudSnapshot.players
      .map((player) =>
        typeof player.id === 'string'
          ? [player.id, timestampValue(player.lastOnlineAt)] as const
          : null,
      )
      .filter((entry): entry is readonly [string, number] => entry != null),
  );

  for (const player of snapshot.players) {
    if (typeof player.id !== 'string') continue;
    const lastOnlineAt = Math.max(
      timestampValue(player.lastOnlineAt),
      cloudPresence.get(player.id) ?? 0,
    );
    if (lastOnlineAt > 0) {
      player.lastOnlineAt = lastOnlineAt;
    }
  }
}

function playerPresenceFromSnapshot(snapshot: SnapshotRecord) {
  return snapshot.players
    .map((player) => {
      const lastOnlineAt = timestampValue(player.lastOnlineAt);
      return typeof player.id === 'string' && lastOnlineAt > 0
        ? { playerId: player.id, lastOnlineAt }
        : null;
    })
    .filter((entry): entry is { playerId: string; lastOnlineAt: number } => entry != null);
}

async function createOrReactivateMissingPlayerCodes(
  env: Env,
  leagueId: string,
  playerIds: string[],
  now: number,
) {
  const rows =
    (await env.DB.prepare(
      'SELECT player_id, player_code_hash, active FROM player_access WHERE league_id = ?',
    ).bind(leagueId).all<PlayerAccessRow>()).results ?? [];
  const rowsByPlayerId = new Map(rows.map((row) => [row.player_id, row]));
  const activeIds = new Set(playerIds);
  const playerCodes: Array<{ playerId: string; playerCode: string }> = [];
  const statements: D1PreparedStatement[] = [];

  for (const row of rows) {
    if (!activeIds.has(row.player_id) && row.active) {
      statements.push(
        env.DB.prepare(
          'UPDATE player_access SET active = 0, updated_at = ? WHERE league_id = ? AND player_id = ?',
        ).bind(now, leagueId, row.player_id),
      );
    }
  }

  for (const playerId of playerIds) {
    const existing = rowsByPlayerId.get(playerId);
    if (existing?.active) continue;

    const playerCode = randomToken(8);
    playerCodes.push({ playerId, playerCode });

    if (existing) {
      statements.push(
        env.DB.prepare(
          `UPDATE player_access
            SET player_code_hash = ?, active = 1, updated_at = ?
            WHERE league_id = ? AND player_id = ?`,
        ).bind(
          await hashCode(leagueId, `player:${playerId}`, playerCode),
          now,
          leagueId,
          playerId,
        ),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `INSERT INTO player_access (
            league_id, player_id, player_code_hash, active, created_at, updated_at
          ) VALUES (?, ?, ?, 1, ?, ?)`,
        ).bind(
          leagueId,
          playerId,
          await hashCode(leagueId, `player:${playerId}`, playerCode),
          now,
          now,
        ),
      );
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return playerCodes;
}

async function regeneratePlayerCodes(
  env: Env,
  leagueId: string,
  playerIds: string[],
  now: number,
) {
  const activeIds = new Set(playerIds);
  const rows =
    (await env.DB.prepare(
      'SELECT player_id, player_code_hash, active FROM player_access WHERE league_id = ?',
    ).bind(leagueId).all<PlayerAccessRow>()).results ?? [];
  const rowsByPlayerId = new Map(rows.map((row) => [row.player_id, row]));
  const statements: D1PreparedStatement[] = [];
  const playerCodes = playerIds.map((playerId) => ({
    playerId,
    playerCode: randomToken(8),
  }));

  for (const row of rows) {
    if (!activeIds.has(row.player_id) && row.active) {
      statements.push(
        env.DB.prepare(
          'UPDATE player_access SET active = 0, updated_at = ? WHERE league_id = ? AND player_id = ?',
        ).bind(now, leagueId, row.player_id),
      );
    }
  }

  for (const playerCode of playerCodes) {
    const codeHash = await hashCode(
      leagueId,
      `player:${playerCode.playerId}`,
      playerCode.playerCode,
    );

    if (rowsByPlayerId.has(playerCode.playerId)) {
      statements.push(
        env.DB.prepare(
          `UPDATE player_access
            SET player_code_hash = ?, active = 1, updated_at = ?
            WHERE league_id = ? AND player_id = ?`,
        ).bind(codeHash, now, leagueId, playerCode.playerId),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `INSERT INTO player_access (
            league_id, player_id, player_code_hash, active, created_at, updated_at
          ) VALUES (?, ?, ?, 1, ?, ?)`,
        ).bind(leagueId, playerCode.playerId, codeHash, now, now),
      );
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return playerCodes;
}

async function authenticateCredential(env: Env, league: LeagueRow, request: Request): Promise<AuthContext | null> {
  const credential = readCredential(request);
  if (!credential) return null;

  if (credential.role === 'host' || credential.role === 'viewer') {
    const expected =
      credential.role === 'host' ? league.host_code_hash : league.viewer_code_hash;
    const actual = await hashCode(league.id, credential.role, credential.code);
    return actual === expected ? { role: credential.role, code: credential.code } : null;
  }

  const rows =
    (await env.DB.prepare(
      `SELECT player_id, player_code_hash, active
        FROM player_access
        WHERE league_id = ? AND active = 1`,
    ).bind(league.id).all<PlayerAccessRow>()).results ?? [];

  for (const row of rows) {
    const actual = await hashCode(league.id, `player:${row.player_id}`, credential.code);
    if (actual === row.player_code_hash) {
      return { ...credential, playerId: row.player_id };
    }
  }

  return null;
}

async function createLeague(request: Request, env: Env) {
  const body = await readJson(request);
  if (!validateSnapshot(body.snapshot)) {
    return errorResponse(400, 'Snapshot must include players, fixtures, odds, bets, scores and matchOdds arrays.');
  }
  applyCapeVerdeSaudiArabiaDateCorrection(body.snapshot);

  const leagueId = randomToken(6);
  const hostCode = randomToken(8);
  const viewerCode = randomToken(8);
  const now = Date.now();
  const schemaVersion = Number.isInteger(body.schemaVersion) ? Number(body.schemaVersion) : 1;
  const snapshotJson = JSON.stringify(body.snapshot);
  const playerIds = playerIdsFromSnapshot(body.snapshot);

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO leagues (
        id, host_code_hash, viewer_code_hash, snapshot_json, schema_version, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(
      leagueId,
      await hashCode(leagueId, 'host', hostCode),
      await hashCode(leagueId, 'viewer', viewerCode),
      snapshotJson,
      schemaVersion,
      now,
      now,
    ),
  ];

  await env.DB.batch(statements);
  const playerCodes = await createOrReactivateMissingPlayerCodes(env, leagueId, playerIds, now);

  return jsonResponse({
    leagueId,
    revision: 1,
    hostId: buildCombinedId('H', leagueId, hostCode),
    viewerId: buildCombinedId('V', leagueId, viewerCode),
    playerPresence: playerPresenceFromSnapshot(body.snapshot),
    playerCodes: playerCodes.map((playerCode) => ({
      playerId: playerCode.playerId,
      playerIdCode: buildCombinedId('P', leagueId, playerCode.playerCode),
    })),
  }, { status: 201 });
}

async function fetchSnapshot(request: Request, env: Env, leagueId: string) {
  const league = await getLeague(env, leagueId);
  if (!league) return errorResponse(404, 'League not found.');

  const auth = await authenticateCredential(env, league, request);
  if (!auth) return errorResponse(401, 'Invalid league ID.');

  const snapshot = JSON.parse(league.snapshot_json) as unknown;
  if (!validateSnapshot(snapshot)) {
    return errorResponse(500, 'Stored league snapshot is invalid.');
  }
  const scheduleChanged = applyCapeVerdeSaudiArabiaDateCorrection(snapshot);

  let responseLeague = league;
  let responseSnapshot = snapshot;
  let updatedAt = league.updated_at;
  if (scheduleChanged || auth.role === 'player') {
    const now = Date.now();
    const presenceChanged = auth.role === 'player' && markPlayerOnline(snapshot, auth.playerId, now);
    if (scheduleChanged || presenceChanged) {
      const result = await env.DB.prepare(
        'UPDATE leagues SET snapshot_json = ?, updated_at = ? WHERE id = ? AND revision = ?',
      ).bind(JSON.stringify(snapshot), now, league.id, league.revision).run();
      if (d1ChangeCount(result) === 0) {
        const latestLeague = await getLeague(env, leagueId);
        if (!latestLeague) return errorResponse(404, 'League not found.');
        const latestSnapshot = JSON.parse(latestLeague.snapshot_json) as unknown;
        if (!validateSnapshot(latestSnapshot)) {
          return errorResponse(500, 'Stored league snapshot is invalid.');
        }
        applyCapeVerdeSaudiArabiaDateCorrection(latestSnapshot);
        responseLeague = latestLeague;
        responseSnapshot = latestSnapshot;
        updatedAt = latestLeague.updated_at;
      } else {
        updatedAt = now;
      }
    }
  }

  return jsonResponse({
    leagueId: responseLeague.id,
    revision: responseLeague.revision,
    schemaVersion: responseLeague.schema_version,
    updatedAt,
    role: auth.role,
    playerId: auth.role === 'player' ? auth.playerId : undefined,
    playerPresence: playerPresenceFromSnapshot(responseSnapshot),
    snapshot: responseSnapshot,
  });
}

async function updateSnapshot(request: Request, env: Env, leagueId: string) {
  const league = await getLeague(env, leagueId);
  if (!league) return errorResponse(404, 'League not found.');

  const auth = await authenticateCredential(env, league, request);
  if (auth?.role !== 'host') return errorResponse(401, 'Invalid host ID.');

  const body = await readJson(request);
  if (!validateSnapshot(body.snapshot)) {
    return errorResponse(400, 'Snapshot must include players, fixtures, odds, bets, scores and matchOdds arrays.');
  }
  applyCapeVerdeSaudiArabiaDateCorrection(body.snapshot);
  if (body.baseRevision !== league.revision) {
    return jsonResponse({
      error: 'Cloud snapshot changed since the last sync.',
      currentRevision: league.revision,
    }, { status: 409 });
  }

  const snapshot = body.snapshot;
  const cloudSnapshot = JSON.parse(league.snapshot_json) as unknown;
  if (validateSnapshot(cloudSnapshot)) {
    applyCapeVerdeSaudiArabiaDateCorrection(cloudSnapshot);
    mergePlayerPresence(snapshot, cloudSnapshot);
  }

  const nextRevision = league.revision + 1;
  const now = Date.now();
  const schemaVersion = Number.isInteger(body.schemaVersion)
    ? Number(body.schemaVersion)
    : league.schema_version;
  const changes = await writeSnapshotIfRevisionMatches(
    env,
    leagueId,
    league.revision,
    snapshot,
    schemaVersion,
    now,
  );
  if (changes === 0) {
    return jsonResponse({
      error: 'Cloud snapshot changed since the last sync.',
      currentRevision: league.revision + 1,
    }, { status: 409 });
  }

  const playerCodes = await createOrReactivateMissingPlayerCodes(
    env,
    leagueId,
    playerIdsFromSnapshot(snapshot),
    now,
  );

  return jsonResponse({
    leagueId,
    revision: nextRevision,
    schemaVersion,
    updatedAt: now,
    playerPresence: playerPresenceFromSnapshot(snapshot),
    playerCodes: playerCodes.map((playerCode) => ({
      playerId: playerCode.playerId,
      playerIdCode: buildCombinedId('P', leagueId, playerCode.playerCode),
    })),
  });
}

function isSupportedScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5;
}

function d1ChangeCount(result: D1Result) {
  const changes = result.meta?.changes;
  return typeof changes === 'number' ? changes : null;
}

async function writeSnapshotIfRevisionMatches(
  env: Env,
  leagueId: string,
  expectedRevision: number,
  snapshot: SnapshotRecord,
  schemaVersion: number,
  now: number,
) {
  const result = await env.DB.prepare(
    `UPDATE leagues
      SET snapshot_json = ?, schema_version = ?, revision = ?, updated_at = ?
      WHERE id = ? AND revision = ?`,
  ).bind(
    JSON.stringify(snapshot),
    schemaVersion,
    expectedRevision + 1,
    now,
    leagueId,
    expectedRevision,
  ).run();
  return d1ChangeCount(result);
}

async function updatePlayerBet(
  request: Request,
  env: Env,
  leagueId: string,
): Promise<Response> {
  const body = (await readJson(request)) as PlayerBetPayload;
  return updatePlayerBetFromBody(request, body, env, leagueId);
}

async function updatePlayerBetFromBody(
  request: Request,
  body: PlayerBetPayload,
  env: Env,
  leagueId: string,
  attempt = 0,
): Promise<Response> {
  const league = await getLeague(env, leagueId);
  if (!league) return errorResponse(404, 'League not found.');

  const auth = await authenticateCredential(env, league, request);
  if (auth?.role !== 'player') return errorResponse(401, 'Invalid player ID.');

  if (typeof body.fixtureId !== 'string' || !body.fixtureId) {
    return errorResponse(400, 'fixtureId is required.');
  }
  if (!isSupportedScore(body.homeScore) || !isSupportedScore(body.awayScore)) {
    return errorResponse(400, 'Scores must be integers from 0 to 5.');
  }

  const snapshot = JSON.parse(league.snapshot_json) as unknown;
  if (!validateSnapshot(snapshot)) {
    return errorResponse(500, 'Stored league snapshot is invalid.');
  }
  applyCapeVerdeSaudiArabiaDateCorrection(snapshot);

  const playerExists = snapshot.players.some((player) => player.id === auth.playerId);
  if (!playerExists) {
    return errorResponse(403, 'This player is no longer active in the league.');
  }

  const fixture = snapshot.fixtures.find((entry) => entry.id === body.fixtureId);
  if (!fixture) {
    return errorResponse(404, 'Fixture not found.');
  }
  const now = Date.now();
  if (fixture.status === 'locked' || hasFixtureStarted(fixture, now)) {
    return errorResponse(409, BET_LOCK_MESSAGE);
  }

  markPlayerOnline(snapshot, auth.playerId, now);
  const existingIndex = snapshot.bets.findIndex(
    (bet) => bet.playerId === auth.playerId && bet.fixtureId === body.fixtureId,
  );
  const existing = existingIndex >= 0 ? snapshot.bets[existingIndex] : null;
  const nextBet = {
    ...(existing ?? {}),
    playerId: auth.playerId,
    fixtureId: body.fixtureId,
    homeScore: body.homeScore,
    awayScore: body.awayScore,
    updatedAt: now,
    updatedBy: 'player' as const,
  };

  if (existingIndex >= 0) {
    snapshot.bets[existingIndex] = nextBet;
  } else {
    snapshot.bets.push(nextBet);
  }

  snapshot.schemaVersion = league.schema_version;
  snapshot.exportedAt = now;

  const changes = await writeSnapshotIfRevisionMatches(
    env,
    leagueId,
    league.revision,
    snapshot,
    league.schema_version,
    now,
  );

  if (changes === 0 && attempt < 3) {
    return updatePlayerBetFromBody(request, body, env, leagueId, attempt + 1);
  }

  if (changes === 0) {
    return errorResponse(409, 'Cloud snapshot changed while saving your bet. Try again.');
  }

  return jsonResponse({
    leagueId,
    revision: league.revision + 1,
    schemaVersion: league.schema_version,
    updatedAt: now,
    role: 'player',
    playerId: auth.playerId,
    playerPresence: playerPresenceFromSnapshot(snapshot),
    snapshot,
  });
}

async function refreshCompletedResults(request: Request, env: Env, leagueId: string) {
  const league = await getLeague(env, leagueId);
  if (!league) return errorResponse(404, 'League not found.');

  const auth = await authenticateCredential(env, league, request);
  if (!auth) return errorResponse(401, 'Invalid league ID.');

  const snapshot = JSON.parse(league.snapshot_json) as unknown;
  if (!validateSnapshot(snapshot)) {
    return errorResponse(500, 'Stored league snapshot is invalid.');
  }
  applyCapeVerdeSaudiArabiaDateCorrection(snapshot);

  const now = Date.now();
  const lastCheckedAt = timestampValue(snapshot.autoResultsLastCheckedAt);
  if (now - lastCheckedAt < AUTO_RESULT_REFRESH_MIN_INTERVAL_MS) {
    return jsonResponse({
      leagueId,
      revision: league.revision,
      schemaVersion: league.schema_version,
      updatedAt: league.updated_at,
      role: auth.role,
      playerId: auth.role === 'player' ? auth.playerId : undefined,
      playerPresence: playerPresenceFromSnapshot(snapshot),
      snapshot,
      lockedFixtureIds: [],
      throttled: true,
      failedFixtures: [],
      unresolvedFixtures: [],
    });
  }

  if (!env.API_FOOTBALL_KEY) {
    return jsonResponse({
      leagueId,
      revision: league.revision,
      schemaVersion: league.schema_version,
      updatedAt: league.updated_at,
      role: auth.role,
      playerId: auth.role === 'player' ? auth.playerId : undefined,
      playerPresence: playerPresenceFromSnapshot(snapshot),
      snapshot,
      lockedFixtureIds: [],
      skippedReason: 'missing_api_key',
      failedFixtures: [],
      unresolvedFixtures: [],
    });
  }

  const candidates = snapshot.fixtures.filter(
    (fixture) =>
      fixture.status !== 'locked' &&
      typeof fixture.id === 'string' &&
      typeof fixture.homeTeam === 'string' &&
      typeof fixture.awayTeam === 'string' &&
      typeof fixture.date === 'string' &&
      canFetchFixtureResult(fixture, now),
  );

  if (candidates.length === 0) {
    return jsonResponse({
      leagueId,
      revision: league.revision,
      schemaVersion: league.schema_version,
      updatedAt: league.updated_at,
      role: auth.role,
      playerId: auth.role === 'player' ? auth.playerId : undefined,
      playerPresence: playerPresenceFromSnapshot(snapshot),
      snapshot,
      lockedFixtureIds: [],
      failedFixtures: [],
      unresolvedFixtures: [],
    });
  }

  snapshot.autoResultsLastCheckedAt = now;
  snapshot.schemaVersion = league.schema_version;
  snapshot.exportedAt = now;

  const claimChanges = await writeSnapshotIfRevisionMatches(
    env,
    leagueId,
    league.revision,
    snapshot,
    league.schema_version,
    now,
  );

  if (claimChanges === 0) {
    const latestLeague = await getLeague(env, leagueId);
    if (!latestLeague) return errorResponse(404, 'League not found.');
    const latestSnapshot = JSON.parse(latestLeague.snapshot_json) as unknown;
    if (!validateSnapshot(latestSnapshot)) {
      return errorResponse(500, 'Stored league snapshot is invalid.');
    }
    applyCapeVerdeSaudiArabiaDateCorrection(latestSnapshot);

    return jsonResponse({
      leagueId,
      revision: latestLeague.revision,
      schemaVersion: latestLeague.schema_version,
      updatedAt: latestLeague.updated_at,
      role: auth.role,
      playerId: auth.role === 'player' ? auth.playerId : undefined,
      playerPresence: playerPresenceFromSnapshot(latestSnapshot),
      snapshot: latestSnapshot,
      lockedFixtureIds: [],
      throttled: true,
      failedFixtures: [],
      unresolvedFixtures: [],
    });
  }

  const lockedFixtureIds: string[] = [];
  const failedFixtures: ResultRefreshFixtureIssue[] = [];
  const unresolvedFixtures: ResultRefreshFixtureIssue[] = [];
  for (const fixture of candidates) {
    const fixtureIssueBase = {
      fixtureId: fixture.id as string,
      homeTeam: fixture.homeTeam as string,
      awayTeam: fixture.awayTeam as string,
    };

    try {
      const result = await fetchMatchResultFromApi(
        fixture.homeTeam as string,
        fixture.awayTeam as string,
        fixture.date as string,
        env.API_FOOTBALL_KEY,
      );

      if (result.kind === 'not_found') {
        unresolvedFixtures.push({ ...fixtureIssueBase, reason: 'not_found' });
        continue;
      }

      if (result.kind === 'not_finished') {
        unresolvedFixtures.push({
          ...fixtureIssueBase,
          reason: 'not_finished',
          status: result.status,
        });
        continue;
      }

      if (result.kind === 'missing_score') {
        unresolvedFixtures.push({
          ...fixtureIssueBase,
          reason: 'missing_score',
          status: result.status,
        });
        continue;
      }

      fixture.status = 'locked';
      fixture.homeScore = result.homeScore;
      fixture.awayScore = result.awayScore;
      recalculateFixtureScores(snapshot, fixture);
      lockedFixtureIds.push(fixture.id as string);
    } catch (err) {
      failedFixtures.push({
        ...fixtureIssueBase,
        reason: 'api_error',
        message: errorMessage(err),
      });
    }
  }

  if (lockedFixtureIds.length === 0) {
    const skippedReason =
      failedFixtures.length > 0
        ? 'api_error'
        : unresolvedFixtures.some((fixture) => fixture.reason === 'not_finished')
        ? 'not_finished'
        : unresolvedFixtures.length > 0
        ? 'not_found'
        : undefined;

    return jsonResponse({
      leagueId,
      revision: league.revision + 1,
      schemaVersion: league.schema_version,
      updatedAt: now,
      role: auth.role,
      playerId: auth.role === 'player' ? auth.playerId : undefined,
      playerPresence: playerPresenceFromSnapshot(snapshot),
      snapshot,
      lockedFixtureIds,
      refreshedAt: now,
      skippedReason,
      failedFixtures,
      unresolvedFixtures,
    });
  }

  const finishedAt = Date.now();
  snapshot.exportedAt = finishedAt;

  const changes = await writeSnapshotIfRevisionMatches(
    env,
    leagueId,
    league.revision + 1,
    snapshot,
    league.schema_version,
    finishedAt,
  );

  if (changes === 0) {
    return jsonResponse({
      error: 'Cloud snapshot changed while refreshing match results.',
      currentRevision: league.revision + 1,
    }, { status: 409 });
  }

  return jsonResponse({
    leagueId,
    revision: league.revision + 2,
    schemaVersion: league.schema_version,
    updatedAt: finishedAt,
    role: auth.role,
    playerId: auth.role === 'player' ? auth.playerId : undefined,
    playerPresence: playerPresenceFromSnapshot(snapshot),
    snapshot,
    lockedFixtureIds,
    refreshedAt: finishedAt,
    failedFixtures,
    unresolvedFixtures,
  });
}

async function rotatePlayerCodes(request: Request, env: Env, leagueId: string) {
  const league = await getLeague(env, leagueId);
  if (!league) return errorResponse(404, 'League not found.');

  const auth = await authenticateCredential(env, league, request);
  if (auth?.role !== 'host') return errorResponse(401, 'Invalid host ID.');

  const snapshot = JSON.parse(league.snapshot_json) as unknown;
  if (!validateSnapshot(snapshot)) {
    return errorResponse(500, 'Stored league snapshot is invalid.');
  }
  applyCapeVerdeSaudiArabiaDateCorrection(snapshot);

  const now = Date.now();
  const playerCodes = await regeneratePlayerCodes(
    env,
    leagueId,
    playerIdsFromSnapshot(snapshot),
    now,
  );

  return jsonResponse({
    leagueId,
    revision: league.revision,
    schemaVersion: league.schema_version,
    updatedAt: now,
    playerPresence: playerPresenceFromSnapshot(snapshot),
    playerCodes: playerCodes.map((playerCode) => ({
      playerId: playerCode.playerId,
      playerIdCode: buildCombinedId('P', leagueId, playerCode.playerCode),
    })),
  });
}

async function route(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (path === '/api/health' && request.method === 'GET') {
    return jsonResponse({ ok: true });
  }

  if (path === '/api/leagues' && request.method === 'POST') {
    return createLeague(request, env);
  }

  const snapshotMatch = path.match(/^\/api\/leagues\/([A-Z0-9]+)\/snapshot$/);
  if (snapshotMatch && request.method === 'GET') {
    return fetchSnapshot(request, env, snapshotMatch[1]);
  }
  if (snapshotMatch && request.method === 'PUT') {
    return updateSnapshot(request, env, snapshotMatch[1]);
  }

  const betsMatch = path.match(/^\/api\/leagues\/([A-Z0-9]+)\/bets$/);
  if (betsMatch && request.method === 'PUT') {
    return updatePlayerBet(request, env, betsMatch[1]);
  }

  const resultsRefreshMatch = path.match(/^\/api\/leagues\/([A-Z0-9]+)\/results\/refresh$/);
  if (resultsRefreshMatch && request.method === 'POST') {
    return refreshCompletedResults(request, env, resultsRefreshMatch[1]);
  }

  const playerCodesMatch = path.match(/^\/api\/leagues\/([A-Z0-9]+)\/player-codes$/);
  if (playerCodesMatch && request.method === 'POST') {
    return rotatePlayerCodes(request, env, playerCodesMatch[1]);
  }

  return errorResponse(404, 'Not found.');
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await route(request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResponse(500, message);
    }
  },
};
