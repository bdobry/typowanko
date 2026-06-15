import type { Bet, Fixture, ScoreEntry } from '../db';
import { SNAPSHOT_SCHEMA_VERSION, type TypowankoSnapshot } from './snapshot';

export interface SnapshotMergeStats {
  cloudBetsKept: number;
  cloudResultsKept: number;
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

function toFixtureMap(fixtures: Fixture[]) {
  return new Map(fixtures.map((fixture) => [fixture.id, fixture]));
}

function comparableFixture(fixture: Fixture | undefined) {
  if (!fixture) return null;
  return {
    id: fixture.id,
    round: fixture.round,
    group: fixture.group ?? null,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    date: fixture.date,
    utcTime: fixture.utcTime ?? null,
    venue: fixture.venue ?? null,
    status: fixture.status,
    homeScore: fixture.homeScore ?? null,
    awayScore: fixture.awayScore ?? null,
    num: fixture.num ?? null,
  };
}

function sameFixture(a: Fixture | undefined, b: Fixture | undefined) {
  return JSON.stringify(comparableFixture(a)) === JSON.stringify(comparableFixture(b));
}

function mergeBets(baseBets: Bet[], localBets: Bet[], cloudBets: Bet[]): {
  bets: Bet[];
  stats: Pick<SnapshotMergeStats, 'cloudBetsKept' | 'hostBetsKept' | 'hostConflictsWon'>;
} {
  const baseMap = toBetMap(baseBets);
  const localMap = toBetMap(localBets);
  const cloudMap = toBetMap(cloudBets);
  const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...cloudMap.keys()]);
  const merged: Bet[] = [];
  const stats: SnapshotMergeStats = {
    cloudBetsKept: 0,
    cloudResultsKept: 0,
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

function mergeFixtures(
  baseFixtures: Fixture[],
  localFixtures: Fixture[],
  cloudFixtures: Fixture[],
): { fixtures: Fixture[]; cloudResultFixtureIds: Set<string>; cloudResultsKept: number } {
  const baseMap = toFixtureMap(baseFixtures);
  const localMap = toFixtureMap(localFixtures);
  const cloudMap = toFixtureMap(cloudFixtures);
  const orderedIds = [
    ...localFixtures.map((fixture) => fixture.id),
    ...cloudFixtures
      .map((fixture) => fixture.id)
      .filter((fixtureId) => !localMap.has(fixtureId)),
  ];
  const fixtures: Fixture[] = [];
  const cloudResultFixtureIds = new Set<string>();
  let cloudResultsKept = 0;

  for (const fixtureId of orderedIds) {
    const base = baseMap.get(fixtureId);
    const local = localMap.get(fixtureId);
    const cloud = cloudMap.get(fixtureId);
    const localChanged = !sameFixture(base, local);
    const cloudChanged = !sameFixture(base, cloud);

    if (cloudChanged && !localChanged && cloud) {
      fixtures.push(cloud);
      if (cloud.status === 'locked') {
        cloudResultFixtureIds.add(cloud.id);
        cloudResultsKept++;
      }
      continue;
    }

    if (local) {
      fixtures.push(local);
    } else if (cloud) {
      fixtures.push(cloud);
    }
  }

  return { fixtures, cloudResultFixtureIds, cloudResultsKept };
}

function mergeScores(
  localScores: (ScoreEntry & { id?: number })[],
  cloudScores: (ScoreEntry & { id?: number })[],
  cloudResultFixtureIds: Set<string>,
) {
  if (cloudResultFixtureIds.size === 0) return localScores;

  return [
    ...localScores.filter((score) => !cloudResultFixtureIds.has(score.fixtureId)),
    ...cloudScores.filter((score) => cloudResultFixtureIds.has(score.fixtureId)),
  ];
}

function maxTimestamp(...values: unknown[]) {
  const timestamps = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
}

export function mergeHostSnapshotWithCloud(
  baseSnapshot: TypowankoSnapshot,
  localSnapshot: TypowankoSnapshot,
  cloudSnapshot: TypowankoSnapshot,
): { snapshot: TypowankoSnapshot; stats: SnapshotMergeStats } {
  const { bets, stats } = mergeBets(baseSnapshot.bets, localSnapshot.bets, cloudSnapshot.bets);
  const { fixtures, cloudResultFixtureIds, cloudResultsKept } = mergeFixtures(
    baseSnapshot.fixtures,
    localSnapshot.fixtures,
    cloudSnapshot.fixtures,
  );
  const localPlayerIds = new Set(localSnapshot.players.map((player) => player.id));
  const localFixtureIds = new Set(fixtures.map((fixture) => fixture.id));

  return {
    snapshot: {
      ...localSnapshot,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: Date.now(),
      autoResultsLastCheckedAt: maxTimestamp(
        baseSnapshot.autoResultsLastCheckedAt,
        localSnapshot.autoResultsLastCheckedAt,
        cloudSnapshot.autoResultsLastCheckedAt,
      ),
      fixtures,
      bets: bets.filter(
        (bet) => localPlayerIds.has(bet.playerId) && localFixtureIds.has(bet.fixtureId),
      ),
      scores: mergeScores(localSnapshot.scores, cloudSnapshot.scores, cloudResultFixtureIds),
    },
    stats: {
      ...stats,
      cloudResultsKept,
    },
  };
}
