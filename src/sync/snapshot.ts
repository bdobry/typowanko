import {
  db,
  type Bet,
  type Fixture,
  type HiddenBet,
  type MatchOdd,
  type Odd,
  type Player,
  type ScoreEntry,
  type TypowankoDb,
} from '../db';

export const SNAPSHOT_SCHEMA_VERSION = 1;

export interface TypowankoSnapshot {
  schemaVersion: number;
  exportedAt: number;
  autoResultsLastCheckedAt?: number;
  players: Player[];
  fixtures: Fixture[];
  odds: Odd[];
  bets: Bet[];
  scores: (ScoreEntry & { id?: number })[];
  matchOdds: MatchOdd[];
}

const LAST_SYNCED_SNAPSHOT_PREFIX = 'typowankoLastSyncedSnapshot:';

export function saveLastSyncedSnapshot(leagueId: string, snapshot: TypowankoSnapshot) {
  try {
    localStorage.setItem(`${LAST_SYNCED_SNAPSHOT_PREFIX}${leagueId}`, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('Could not save last synced snapshot for conflict merging.', err);
  }
}

export function loadLastSyncedSnapshot(leagueId: string): TypowankoSnapshot | null {
  const raw = localStorage.getItem(`${LAST_SYNCED_SNAPSHOT_PREFIX}${leagueId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TypowankoSnapshot;
  } catch {
    localStorage.removeItem(`${LAST_SYNCED_SNAPSHOT_PREFIX}${leagueId}`);
    return null;
  }
}

export function removeLastSyncedSnapshot(leagueId: string) {
  localStorage.removeItem(`${LAST_SYNCED_SNAPSHOT_PREFIX}${leagueId}`);
}

export async function exportSnapshot(sourceDb: TypowankoDb = db): Promise<TypowankoSnapshot> {
  const [players, fixtures, odds, bets, scores, matchOdds] = await Promise.all([
    sourceDb.players.toArray(),
    sourceDb.fixtures.toArray(),
    sourceDb.odds.toArray(),
    sourceDb.bets.toArray(),
    sourceDb.scores.toArray(),
    sourceDb.matchOdds.toArray(),
  ]);

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    players,
    fixtures,
    odds,
    bets,
    scores,
    matchOdds,
  };
}

export async function importSnapshot(
  snapshot: TypowankoSnapshot,
  targetDb: TypowankoDb = db,
  hiddenBets: HiddenBet[] = [],
) {
  await targetDb.transaction(
    'rw',
    [
      targetDb.players,
      targetDb.fixtures,
      targetDb.odds,
      targetDb.bets,
      targetDb.hiddenBets,
      targetDb.scores,
      targetDb.matchOdds,
    ],
    async () => {
      await Promise.all([
        targetDb.players.clear(),
        targetDb.fixtures.clear(),
        targetDb.odds.clear(),
        targetDb.bets.clear(),
        targetDb.hiddenBets.clear(),
        targetDb.scores.clear(),
        targetDb.matchOdds.clear(),
      ]);

      await Promise.all([
        snapshot.players.length ? targetDb.players.bulkAdd(snapshot.players) : Promise.resolve(),
        snapshot.fixtures.length ? targetDb.fixtures.bulkAdd(snapshot.fixtures) : Promise.resolve(),
        snapshot.odds.length ? targetDb.odds.bulkAdd(snapshot.odds) : Promise.resolve(),
        snapshot.bets.length ? targetDb.bets.bulkAdd(snapshot.bets) : Promise.resolve(),
        hiddenBets.length ? targetDb.hiddenBets.bulkAdd(hiddenBets) : Promise.resolve(),
        snapshot.scores.length ? targetDb.scores.bulkAdd(snapshot.scores) : Promise.resolve(),
        snapshot.matchOdds.length ? targetDb.matchOdds.bulkAdd(snapshot.matchOdds) : Promise.resolve(),
      ]);
    },
  );
}

export async function hasHostProgress(sourceDb: TypowankoDb = db) {
  const [players, bets, odds, scores, matchOdds, lockedFixtures] = await Promise.all([
    sourceDb.players.count(),
    sourceDb.bets.count(),
    sourceDb.odds.count(),
    sourceDb.scores.count(),
    sourceDb.matchOdds.count(),
    sourceDb.fixtures.where('status').equals('locked').count(),
  ]);

  return players + bets + odds + scores + matchOdds + lockedFixtures > 0;
}

export function downloadSnapshot(snapshot: TypowankoSnapshot, suffix = 'backup') {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
  anchor.href = url;
  anchor.download = `typowanko-${suffix}-${timestamp}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
