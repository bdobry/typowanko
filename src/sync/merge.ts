import type { Bet } from '../db';
import { SNAPSHOT_SCHEMA_VERSION, type TypowankoSnapshot } from './snapshot';

export interface SnapshotMergeStats {
  cloudBetsKept: number;
  hostBetsKept: number;
  hostConflictsWon: number;
}

function betKey(bet: Pick<Bet, 'playerId' | 'fixtureId'>) {
  return `${bet.playerId}:${bet.fixtureId}`;
}

function comparableBet(bet: Bet | undefined) {
  if (!bet) return null;
  return {
    playerId: bet.playerId,
    fixtureId: bet.fixtureId,
    homeScore: bet.homeScore,
    awayScore: bet.awayScore,
    updatedAt: bet.updatedAt ?? null,
    updatedBy: bet.updatedBy ?? null,
  };
}

function sameBet(a: Bet | undefined, b: Bet | undefined) {
  return JSON.stringify(comparableBet(a)) === JSON.stringify(comparableBet(b));
}

function toBetMap(bets: Bet[]) {
  return new Map(bets.map((bet) => [betKey(bet), bet]));
}

function mergeBets(baseBets: Bet[], localBets: Bet[], cloudBets: Bet[]): {
  bets: Bet[];
  stats: SnapshotMergeStats;
} {
  const baseMap = toBetMap(baseBets);
  const localMap = toBetMap(localBets);
  const cloudMap = toBetMap(cloudBets);
  const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...cloudMap.keys()]);
  const merged: Bet[] = [];
  const stats: SnapshotMergeStats = {
    cloudBetsKept: 0,
    hostBetsKept: 0,
    hostConflictsWon: 0,
  };

  for (const key of keys) {
    const base = baseMap.get(key);
    const local = localMap.get(key);
    const cloud = cloudMap.get(key);
    const localChanged = !sameBet(base, local);
    const cloudChanged = !sameBet(base, cloud);

    if (localChanged) {
      if (local) {
        merged.push(local);
        stats.hostBetsKept++;
      }
      if (cloudChanged) {
        stats.hostConflictsWon++;
      }
      continue;
    }

    if (cloudChanged) {
      if (cloud) {
        merged.push(cloud);
        stats.cloudBetsKept++;
      }
      continue;
    }

    if (local) {
      merged.push(local);
    }
  }

  return { bets: merged, stats };
}

export function mergeHostSnapshotWithCloud(
  baseSnapshot: TypowankoSnapshot,
  localSnapshot: TypowankoSnapshot,
  cloudSnapshot: TypowankoSnapshot,
): { snapshot: TypowankoSnapshot; stats: SnapshotMergeStats } {
  const { bets, stats } = mergeBets(baseSnapshot.bets, localSnapshot.bets, cloudSnapshot.bets);
  const localPlayerIds = new Set(localSnapshot.players.map((player) => player.id));
  const localFixtureIds = new Set(localSnapshot.fixtures.map((fixture) => fixture.id));

  return {
    snapshot: {
      ...localSnapshot,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: Date.now(),
      bets: bets.filter(
        (bet) => localPlayerIds.has(bet.playerId) && localFixtureIds.has(bet.fixtureId),
      ),
    },
    stats,
  };
}
