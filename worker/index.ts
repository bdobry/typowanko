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
  players: Array<{ id?: unknown; name?: unknown }>;
  fixtures: Array<{ id?: unknown; status?: unknown }>;
  odds: unknown[];
  bets: Array<{
    id?: number;
    playerId?: unknown;
    fixtureId?: unknown;
    homeScore?: unknown;
    awayScore?: unknown;
    updatedAt?: number;
    updatedBy?: 'host' | 'player';
  }>;
  scores: unknown[];
  matchOdds: unknown[];
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-typowanko-role,x-typowanko-code',
};

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

  return jsonResponse({
    leagueId: league.id,
    revision: league.revision,
    schemaVersion: league.schema_version,
    updatedAt: league.updated_at,
    role: auth.role,
    playerId: auth.role === 'player' ? auth.playerId : undefined,
    snapshot: JSON.parse(league.snapshot_json),
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
  if (body.baseRevision !== league.revision) {
    return jsonResponse({
      error: 'Cloud snapshot changed since the last sync.',
      currentRevision: league.revision,
    }, { status: 409 });
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
    body.snapshot,
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
    playerIdsFromSnapshot(body.snapshot),
    now,
  );

  return jsonResponse({
    leagueId,
    revision: nextRevision,
    schemaVersion,
    updatedAt: now,
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

  const playerExists = snapshot.players.some((player) => player.id === auth.playerId);
  if (!playerExists) {
    return errorResponse(403, 'This player is no longer active in the league.');
  }

  const fixture = snapshot.fixtures.find((entry) => entry.id === body.fixtureId);
  if (!fixture) {
    return errorResponse(404, 'Fixture not found.');
  }
  if (fixture.status === 'locked') {
    return errorResponse(409, 'This fixture is already locked.');
  }

  const now = Date.now();
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
    snapshot,
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
