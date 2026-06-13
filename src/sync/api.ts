import { SNAPSHOT_SCHEMA_VERSION, type TypowankoSnapshot } from './snapshot';

export type CloudRole = 'host' | 'viewer' | 'player';

export interface CloudCredential {
  role: CloudRole;
  leagueId: string;
  code: string;
  combinedId: string;
  playerId?: string;
}

export interface PlayerCode {
  playerId: string;
  playerIdCode: string;
}

export interface PlayerPresence {
  playerId: string;
  lastOnlineAt: number;
}

export interface CreateLeagueResponse {
  leagueId: string;
  revision: number;
  hostId: string;
  viewerId: string;
  playerCodes: PlayerCode[];
  playerPresence?: PlayerPresence[];
}

export interface SnapshotResponse {
  leagueId: string;
  revision: number;
  schemaVersion: number;
  updatedAt: number;
  role?: CloudRole;
  playerId?: string;
  playerPresence?: PlayerPresence[];
  snapshot: TypowankoSnapshot;
}

export interface ResultRefreshResponse extends SnapshotResponse {
  lockedFixtureIds?: string[];
  refreshedAt?: number;
  throttled?: boolean;
  skippedReason?: string;
}

export interface PushSnapshotResponse {
  leagueId: string;
  revision: number;
  schemaVersion: number;
  updatedAt: number;
  playerCodes?: PlayerCode[];
  playerPresence?: PlayerPresence[];
}

export interface PlayerCodesResponse {
  leagueId: string;
  revision: number;
  schemaVersion: number;
  updatedAt: number;
  playerCodes: PlayerCode[];
  playerPresence?: PlayerPresence[];
}

export class SyncApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'SyncApiError';
    this.status = status;
    this.body = body;
  }
}

const SYNC_API_BASE = (import.meta.env.VITE_SYNC_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? '';
const COMBINED_ID_PATTERN = /^TYP-([HVP])-([A-Z0-9]+)-([A-Z0-9]+)$/i;

export function getSyncApiBase() {
  return SYNC_API_BASE;
}

export function parseCombinedId(input: string): CloudCredential | null {
  const match = input.trim().toUpperCase().match(COMBINED_ID_PATTERN);
  if (!match) return null;

  const role = match[1] === 'H' ? 'host' : match[1] === 'V' ? 'viewer' : 'player';
  return {
    role,
    leagueId: match[2],
    code: match[3],
    combinedId: `TYP-${match[1]}-${match[2]}-${match[3]}`,
  };
}

function endpoint(path: string) {
  if (!SYNC_API_BASE) {
    throw new Error('Brak VITE_SYNC_API_BASE. Skonfiguruj adres Cloudflare Workera przed użyciem synchronizacji.');
  }
  return `${SYNC_API_BASE}${path}`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `Sync API error ${response.status}`;
    throw new SyncApiError(message, response.status, body);
  }
  return body as T;
}

function credentialHeaders(credential: CloudCredential) {
  return {
    'x-typowanko-role': credential.role,
    'x-typowanko-code': credential.code,
  };
}

export async function createLeague(snapshot: TypowankoSnapshot) {
  const response = await fetch(endpoint('/api/leagues'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshot,
    }),
  });
  return readResponse<CreateLeagueResponse>(response);
}

export async function fetchLeagueSnapshot(credential: CloudCredential) {
  const response = await fetch(endpoint(`/api/leagues/${credential.leagueId}/snapshot`), {
    headers: credentialHeaders(credential),
  });
  return readResponse<SnapshotResponse>(response);
}

export async function pushLeagueSnapshot(
  credential: CloudCredential,
  snapshot: TypowankoSnapshot,
  baseRevision: number,
) {
  const response = await fetch(endpoint(`/api/leagues/${credential.leagueId}/snapshot`), {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...credentialHeaders(credential),
    },
    body: JSON.stringify({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshot,
      baseRevision,
    }),
  });
  return readResponse<PushSnapshotResponse>(response);
}

export async function submitPlayerBet(
  credential: CloudCredential,
  fixtureId: string,
  homeScore: number,
  awayScore: number,
) {
  const response = await fetch(endpoint(`/api/leagues/${credential.leagueId}/bets`), {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...credentialHeaders(credential),
    },
    body: JSON.stringify({
      fixtureId,
      homeScore,
      awayScore,
    }),
  });
  return readResponse<SnapshotResponse>(response);
}

export async function refreshCompletedResults(credential: CloudCredential) {
  const response = await fetch(endpoint(`/api/leagues/${credential.leagueId}/results/refresh`), {
    method: 'POST',
    headers: credentialHeaders(credential),
  });
  return readResponse<ResultRefreshResponse>(response);
}

export async function regeneratePlayerCodes(credential: CloudCredential) {
  const response = await fetch(endpoint(`/api/leagues/${credential.leagueId}/player-codes`), {
    method: 'POST',
    headers: credentialHeaders(credential),
  });
  return readResponse<PlayerCodesResponse>(response);
}
