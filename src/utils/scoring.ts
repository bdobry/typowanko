import { db, type Bet, type Fixture, type MatchOdd, type Odd, type Player, type ScoreEntry } from '../db';
import { compareFixturesByKickoff, hasFixtureStarted } from './fixtureTime';

export function scoreKey(h: number, a: number) {
  return `${h}:${a}`;
}

function getOutcome(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

/** Recalculate and save all scores for a locked fixture */
export async function recalcFixture(fixture: Fixture) {
  if (fixture.homeScore == null || fixture.awayScore == null) return;
  const { homeScore: rh, awayScore: ra } = fixture;

  // Find the odd for this exact score
  const exactOdd = await db.odds
    .where('[fixtureId+homeScore+awayScore]')
    .equals([fixture.id, rh, ra])
    .first();
  const exactOddValue = exactOdd?.odd ?? 0;

  // Find the 1X2 (match winner) odds for this fixture
  const matchOdd = await db.matchOdds.where('fixtureId').equals(fixture.id).first();
  const resultOutcome = getOutcome(rh, ra);

  // Get all bets for this fixture
  const bets: Bet[] = await db.bets.where('fixtureId').equals(fixture.id).toArray();

  // Remove old scores for this fixture
  await db.scores.where('fixtureId').equals(fixture.id).delete();

  // Calculate scores for each bet
  const newScores: (Parameters<typeof db.scores.bulkAdd>[0][number])[] = [];

  for (const b of bets) {
    const isExact = b.homeScore === rh && b.awayScore === ra;
    if (isExact && exactOddValue > 0) {
      newScores.push({
        playerId: b.playerId,
        fixtureId: fixture.id,
        points: exactOddValue,
        betHomeScore: b.homeScore,
        betAwayScore: b.awayScore,
        resultHomeScore: rh,
        resultAwayScore: ra,
        odd: exactOddValue,
        pointType: 'exact',
      });
    } else if (!isExact && matchOdd) {
      const betOutcome = getOutcome(b.homeScore, b.awayScore);
      if (betOutcome === resultOutcome) {
        const outcomeOdd =
          resultOutcome === 'home'
            ? matchOdd.homeOdd
            : resultOutcome === 'draw'
            ? matchOdd.drawOdd
            : matchOdd.awayOdd;
        if (outcomeOdd > 0) {
          newScores.push({
            playerId: b.playerId,
            fixtureId: fixture.id,
            points: outcomeOdd,
            betHomeScore: b.homeScore,
            betAwayScore: b.awayScore,
            resultHomeScore: rh,
            resultAwayScore: ra,
            odd: outcomeOdd,
            pointType: 'outcome',
          });
        }
      }
    }
  }

  await db.scores.bulkAdd(newScores);
}

export async function getLeaderboard() {
  const data = await getLeaderboardData();
  return data.board;
}

type StoredScoreEntry = ScoreEntry & { id?: number };

export interface LeaderboardRow {
  player: Player;
  total: number;
  history: StoredScoreEntry[];
  exactHits: number;
  outcomeHits: number;
  lastMatchPoints: number;
  recentForm: LeaderboardFormEntry[];
  currentPosition: number;
  previousPosition: number;
  positionDelta: number;
}

export interface LeaderboardFormEntry {
  fixture: Fixture;
  result: 'upcoming' | 'exact' | 'outcome' | 'miss' | 'none';
  points: number;
  betHomeScore?: number;
  betAwayScore?: number;
}

export interface LeaderboardTimelinePoint {
  fixture: Fixture;
  matchNumber: number;
  totalsByPlayerId: Record<string, number>;
  pointsByPlayerId: Record<string, number>;
  hasOdds: boolean;
}

export interface LeaderboardEvent {
  id: string;
  player: Player;
  score: StoredScoreEntry;
}

export interface LeaderboardEventGroup {
  id: string;
  fixture: Fixture;
  pointType: 'exact' | 'outcome';
  events: LeaderboardEvent[];
}

export interface LeaderboardStreakWinner {
  player: Player;
  entries: LeaderboardFormEntry[];
}

export interface LeaderboardStreak {
  bestLength: number;
  winners: LeaderboardStreakWinner[];
}

export interface LeaderboardMatchPoints {
  fixture: Fixture;
  totalPoints: number;
  hitCount: number;
  exactHitCount: number;
  outcomeHitCount: number;
}

export interface LeaderboardFixtureBetResult {
  player: Player;
  result: LeaderboardFormEntry['result'];
  points: number;
  betHomeScore?: number;
  betAwayScore?: number;
}

export interface LeaderboardLowHitMatch extends LeaderboardMatchPoints {
  playerResults: LeaderboardFixtureBetResult[];
}

export interface LeaderboardBiggestMiss {
  id: string;
  player: Player;
  fixture: Fixture;
  betHomeScore: number;
  betAwayScore: number;
  resultHomeScore: number;
  resultAwayScore: number;
  error: number;
  homeError: number;
  awayError: number;
}

export interface LeaderboardMissedOdd {
  id: string;
  player: Player;
  fixture: Fixture;
  betHomeScore: number;
  betAwayScore: number;
  resultHomeScore: number;
  resultAwayScore: number;
  odd: number;
}

export interface LeaderboardAlmostHit extends LeaderboardMissedOdd {
  error: number;
  homeError: number;
  awayError: number;
}

export interface LeaderboardMissedOutcomeOddGroup {
  id: string;
  fixture: Fixture;
  odd: number;
  entries: LeaderboardMissedOdd[];
}

export interface LeaderboardBestHit {
  id: string;
  player: Player;
  fixture: Fixture;
  points: number;
  betHomeScore: number;
  betAwayScore: number;
  resultHomeScore: number;
  resultAwayScore: number;
  pointType: 'exact' | 'outcome';
}

export interface LeaderboardData {
  board: LeaderboardRow[];
  lockedCount: number;
  totalFixtures: number;
  lastFixture: Fixture | null;
  timeline: LeaderboardTimelinePoint[];
  recentEvents: LeaderboardEventGroup[];
  bestHits: LeaderboardBestHit[];
  almostHits: LeaderboardAlmostHit[];
  streaks: {
    points: LeaderboardStreak;
    exact: LeaderboardStreak;
    miss: LeaderboardStreak;
  };
  matchStats: {
    topScoring: LeaderboardMatchPoints[];
    zeroHitFixtures: LeaderboardMatchPoints[];
    lowHitMatches: LeaderboardLowHitMatch[];
    biggestMisses: LeaderboardBiggestMiss[];
    missedOdds: {
      lowest: LeaderboardMissedOdd[];
      lowestOutcome: LeaderboardMissedOutcomeOddGroup[];
      highestOutcome: LeaderboardMissedOutcomeOddGroup[];
      highest: LeaderboardMissedOdd[];
    };
    fullyHitFixtures: LeaderboardMatchPoints[];
  };
}

function roundPoints(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type LeaderboardBaseRow = Omit<LeaderboardRow, 'currentPosition' | 'previousPosition' | 'positionDelta'>;
type LeaderboardPositionedRow = Omit<LeaderboardRow, 'previousPosition' | 'positionDelta'>;

function sortRows(rows: LeaderboardBaseRow[]) {
  return [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
    if (b.outcomeHits !== a.outcomeHits) return b.outcomeHits - a.outcomeHits;
    return a.player.name.localeCompare(b.player.name, 'pl-PL');
  });
}

function assignPositions(rows: LeaderboardBaseRow[]): LeaderboardPositionedRow[] {
  let currentPosition = 0;
  let previousTotal: number | null = null;

  return rows.map((row, index) => {
    if (previousTotal == null || row.total !== previousTotal) {
      currentPosition = index + 1;
      previousTotal = row.total;
    }

    return {
      ...row,
      currentPosition,
    };
  });
}

function formEntryForFixture(
  playerId: string,
  fixture: Fixture,
  scoreByPlayerFixture: Map<string, StoredScoreEntry>,
  betByPlayerFixture: Map<string, Bet>,
): LeaderboardFormEntry {
  const key = `${playerId}:${fixture.id}`;
  const bet = betByPlayerFixture.get(key);

  if (fixture.status !== 'locked') {
    return {
      fixture,
      result: 'upcoming',
      points: 0,
      betHomeScore: bet?.homeScore,
      betAwayScore: bet?.awayScore,
    };
  }

  const score = scoreByPlayerFixture.get(key);
  return {
    fixture,
    result: score?.pointType === 'outcome' ? 'outcome' : score ? 'exact' : bet ? 'miss' : 'none',
    points: roundPoints(score?.points ?? 0),
    betHomeScore: bet?.homeScore ?? score?.betHomeScore,
    betAwayScore: bet?.awayScore ?? score?.betAwayScore,
  };
}

function bestMatchingRun(entries: LeaderboardFormEntry[], predicate: (entry: LeaderboardFormEntry) => boolean) {
  let current: LeaderboardFormEntry[] = [];
  let best: LeaderboardFormEntry[] = [];

  for (const entry of entries) {
    if (predicate(entry)) {
      current = [...current, entry];
    } else {
      if (current.length > best.length) best = current;
      current = [];
    }
  }

  if (current.length > best.length) best = current;
  return best;
}

function bestMatchingRunIgnoringNeutral(
  entries: LeaderboardFormEntry[],
  predicate: (entry: LeaderboardFormEntry) => boolean,
  isNeutral: (entry: LeaderboardFormEntry) => boolean,
) {
  let current: LeaderboardFormEntry[] = [];
  let best: LeaderboardFormEntry[] = [];

  for (const entry of entries) {
    if (predicate(entry)) {
      current = [...current, entry];
    } else if (!isNeutral(entry)) {
      if (current.length > best.length) best = current;
      current = [];
    }
  }

  if (current.length > best.length) best = current;
  return best;
}

function buildStreak(
  rows: LeaderboardRow[],
  fullFormByPlayerId: Map<string, LeaderboardFormEntry[]>,
  predicate: (entry: LeaderboardFormEntry) => boolean,
  findBestRun = bestMatchingRun,
): LeaderboardStreak {
  let bestLength = 0;
  const winners: LeaderboardStreakWinner[] = [];

  for (const row of rows) {
    const entries = findBestRun(fullFormByPlayerId.get(row.player.id) ?? [], predicate);
    if (entries.length === 0) continue;

    if (entries.length > bestLength) {
      bestLength = entries.length;
      winners.length = 0;
    }

    if (entries.length === bestLength) {
      winners.push({ player: row.player, entries });
    }
  }

  return { bestLength, winners };
}

function resultOrder(result: LeaderboardFormEntry['result']) {
  if (result === 'exact') return 0;
  if (result === 'outcome') return 1;
  if (result === 'miss') return 2;
  if (result === 'none') return 3;
  return 4;
}

function buildFixtureBetResults(
  players: Player[],
  fixture: Fixture,
  scoreByPlayerFixture: Map<string, StoredScoreEntry>,
  betByPlayerFixture: Map<string, Bet>,
): LeaderboardFixtureBetResult[] {
  return players
    .map((player) => {
      const entry = formEntryForFixture(player.id, fixture, scoreByPlayerFixture, betByPlayerFixture);
      return {
        player,
        result: entry.result,
        points: entry.points,
        betHomeScore: entry.betHomeScore,
        betAwayScore: entry.betAwayScore,
      };
    })
    .sort((a, b) => {
      const resultDelta = resultOrder(a.result) - resultOrder(b.result);
      if (resultDelta !== 0) return resultDelta;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    });
}

function buildRows(
  players: Player[],
  scores: StoredScoreEntry[],
  bets: Bet[] = [],
  lastMatchPointsByPlayerId = new Map<string, number>(),
  recentFixtures: Fixture[] = [],
) {
  const scoresByPlayerId = new Map<string, StoredScoreEntry[]>();
  for (const score of scores) {
    const entries = scoresByPlayerId.get(score.playerId) ?? [];
    entries.push(score);
    scoresByPlayerId.set(score.playerId, entries);
  }
  const betByPlayerFixture = new Map(bets.map((bet) => [`${bet.playerId}:${bet.fixtureId}`, bet]));
  const scoreByPlayerFixture = new Map(scores.map((score) => [`${score.playerId}:${score.fixtureId}`, score]));

  return sortRows(
    players.map((player) => {
      const history = scoresByPlayerId.get(player.id) ?? [];
      const total = history.reduce((acc, score) => acc + score.points, 0);
      return {
        player,
        total: roundPoints(total),
        history,
        exactHits: history.filter((score) => score.pointType !== 'outcome').length,
        outcomeHits: history.filter((score) => score.pointType === 'outcome').length,
        lastMatchPoints: roundPoints(lastMatchPointsByPlayerId.get(player.id) ?? 0),
        recentForm: recentFixtures.map((fixture) =>
          formEntryForFixture(player.id, fixture, scoreByPlayerFixture, betByPlayerFixture),
        ),
      };
    }),
  );
}

function bestHitGroupKey(hit: LeaderboardBestHit) {
  return [
    hit.fixture.id,
    hit.pointType,
    hit.points,
    hit.resultHomeScore,
    hit.resultAwayScore,
  ].join(':');
}

function takeBestHitsWithCutoffGroup(hits: LeaderboardBestHit[], limit: number) {
  if (hits.length <= limit) return hits;

  const cutoffGroupKey = bestHitGroupKey(hits[limit - 1]);
  let endIndex = limit;

  while (endIndex < hits.length && bestHitGroupKey(hits[endIndex]) === cutoffGroupKey) {
    endIndex += 1;
  }

  return hits.slice(0, endIndex);
}

export async function getLeaderboardData(): Promise<LeaderboardData> {
  const [players, allScores, fixtures, bets, odds, matchOdds] = await Promise.all([
    db.players.toArray(),
    db.scores.toArray(),
    db.fixtures.toArray(),
    db.bets.toArray(),
    db.odds.toArray(),
    db.matchOdds.toArray(),
  ]);
  const totalFixtures = fixtures.length;
  const lockedFixtures = fixtures
    .filter((fixture) => fixture.status === 'locked')
    .sort(compareFixturesByKickoff);
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const lastFixture = lockedFixtures.at(-1) ?? null;

  const scores = allScores as StoredScoreEntry[];
  const lastMatchPointsByPlayerId = new Map<string, number>();
  if (lastFixture) {
    for (const score of scores.filter((entry) => entry.fixtureId === lastFixture.id)) {
      lastMatchPointsByPlayerId.set(
        score.playerId,
        (lastMatchPointsByPlayerId.get(score.playerId) ?? 0) + score.points,
      );
    }
  }

  const previousScores = lastFixture
    ? scores.filter((score) => score.fixtureId !== lastFixture.id)
    : scores;
  const nextUpcomingFixture = fixtures
    .filter((fixture) => fixture.status !== 'locked' && !hasFixtureStarted(fixture))
    .sort(compareFixturesByKickoff)[0];
  const recentFixtures = [
    ...(nextUpcomingFixture ? [nextUpcomingFixture] : []),
    ...lockedFixtures.slice(-5).reverse(),
  ];
  const previousRows = assignPositions(buildRows(players, previousScores, bets, new Map(), recentFixtures));
  const previousPositionByPlayerId = new Map(
    previousRows.map((row) => [row.player.id, row.currentPosition]),
  );

  const board = assignPositions(buildRows(players, scores, bets, lastMatchPointsByPlayerId, recentFixtures)).map((row) => {
    const { currentPosition } = row;
    const previousPosition = previousPositionByPlayerId.get(row.player.id) ?? currentPosition;
    return {
      ...row,
      currentPosition,
      previousPosition,
      positionDelta: previousPosition - currentPosition,
    };
  });

  const scoresByFixtureId = new Map<string, StoredScoreEntry[]>();
  for (const score of scores) {
    const entries = scoresByFixtureId.get(score.fixtureId) ?? [];
    entries.push(score);
    scoresByFixtureId.set(score.fixtureId, entries);
  }
  const scoreByPlayerFixture = new Map(scores.map((score) => [`${score.playerId}:${score.fixtureId}`, score]));
  const betByPlayerFixture = new Map(bets.map((bet) => [`${bet.playerId}:${bet.fixtureId}`, bet]));
  const exactOddByBetKey = new Map(
    (odds as Odd[])
      .filter((odd) => odd.odd > 0)
      .map((odd) => [`${odd.fixtureId}:${odd.homeScore}:${odd.awayScore}`, odd.odd]),
  );
  const matchOddByFixtureId = new Map((matchOdds as MatchOdd[]).map((odd) => [odd.fixtureId, odd]));
  const pointsByFixture = lockedFixtures.map((fixture) => {
    const entries = scoresByFixtureId.get(fixture.id) ?? [];
    return {
      fixture,
      totalPoints: roundPoints(entries.reduce((acc, score) => acc + score.points, 0)),
      hitCount: entries.length,
      exactHitCount: entries.filter((score) => score.pointType !== 'outcome').length,
      outcomeHitCount: entries.filter((score) => score.pointType === 'outcome').length,
    };
  });
  const lowHitTarget = pointsByFixture.some((entry) => entry.hitCount === 1)
    ? 1
    : pointsByFixture.some((entry) => entry.hitCount === 2)
    ? 2
    : null;
  const lowHitMatches =
    lowHitTarget == null
      ? []
      : pointsByFixture
          .filter((entry) => entry.hitCount === lowHitTarget)
          .sort((a, b) => compareFixturesByKickoff(b.fixture, a.fixture))
          .map((entry) => ({
            ...entry,
            playerResults: buildFixtureBetResults(players, entry.fixture, scoreByPlayerFixture, betByPlayerFixture),
  }));
  const biggestMissCandidates: LeaderboardBiggestMiss[] = [];
  const missedOddCandidates: LeaderboardMissedOdd[] = [];
  const missedOutcomeOddCandidates: LeaderboardMissedOdd[] = [];
  const almostHitCandidates: LeaderboardAlmostHit[] = [];
  for (const fixture of lockedFixtures) {
    if (fixture.homeScore == null || fixture.awayScore == null) continue;

    for (const bet of bets.filter((entry) => entry.fixtureId === fixture.id)) {
      const player = playerMap.get(bet.playerId);
      if (!player) continue;

      const homeError = Math.abs(bet.homeScore - fixture.homeScore);
      const awayError = Math.abs(bet.awayScore - fixture.awayScore);
      const error = homeError + awayError;
      if (error <= 0) continue;
      const id = String(bet.id ?? `${bet.playerId}:${fixture.id}`);
      const missedOdd = exactOddByBetKey.get(`${fixture.id}:${bet.homeScore}:${bet.awayScore}`);
      const matchOdd = matchOddByFixtureId.get(fixture.id);
      const betOutcome = getOutcome(bet.homeScore, bet.awayScore);
      const missedOutcomeOdd =
        betOutcome === 'home'
          ? matchOdd?.homeOdd
          : betOutcome === 'draw'
          ? matchOdd?.drawOdd
          : matchOdd?.awayOdd;

      if (missedOdd != null && error === 1) {
        almostHitCandidates.push({
          id,
          player,
          fixture,
          betHomeScore: bet.homeScore,
          betAwayScore: bet.awayScore,
          resultHomeScore: fixture.homeScore,
          resultAwayScore: fixture.awayScore,
          odd: missedOdd,
          error,
          homeError,
          awayError,
        });
      }

      if (scoreByPlayerFixture.has(`${bet.playerId}:${fixture.id}`)) continue;

      biggestMissCandidates.push({
        id,
        player,
        fixture,
        betHomeScore: bet.homeScore,
        betAwayScore: bet.awayScore,
        resultHomeScore: fixture.homeScore,
        resultAwayScore: fixture.awayScore,
        error,
        homeError,
        awayError,
      });
      if (missedOdd != null) {
        missedOddCandidates.push({
          id,
          player,
          fixture,
          betHomeScore: bet.homeScore,
          betAwayScore: bet.awayScore,
          resultHomeScore: fixture.homeScore,
          resultAwayScore: fixture.awayScore,
          odd: missedOdd,
        });
      }
      if (missedOutcomeOdd != null && missedOutcomeOdd > 0) {
        missedOutcomeOddCandidates.push({
          id,
          player,
          fixture,
          betHomeScore: bet.homeScore,
          betAwayScore: bet.awayScore,
          resultHomeScore: fixture.homeScore,
          resultAwayScore: fixture.awayScore,
          odd: missedOutcomeOdd,
        });
      }
    }
  }
  const biggestMisses = biggestMissCandidates
    .sort((a, b) => {
      if (b.error !== a.error) return b.error - a.error;
      const fixtureDelta = compareFixturesByKickoff(b.fixture, a.fixture);
      if (fixtureDelta !== 0) return fixtureDelta;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    })
    .slice(0, 5);
  const almostHits = almostHitCandidates
    .sort((a, b) => {
      if (b.odd !== a.odd) return b.odd - a.odd;
      const fixtureDelta = compareFixturesByKickoff(b.fixture, a.fixture);
      if (fixtureDelta !== 0) return fixtureDelta;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    });
  const sortMissedOdds = (entries: LeaderboardMissedOdd[]) =>
    [...entries].sort((a, b) => {
      const fixtureDelta = compareFixturesByKickoff(b.fixture, a.fixture);
      if (fixtureDelta !== 0) return fixtureDelta;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    });
  const sortHighestMissedOdds = (entries: LeaderboardMissedOdd[]) =>
    [...entries].sort((a, b) => {
      if (b.odd !== a.odd) return b.odd - a.odd;
      const fixtureDelta = compareFixturesByKickoff(b.fixture, a.fixture);
      if (fixtureDelta !== 0) return fixtureDelta;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    });
  const groupMissedOutcomeOdds = (entries: LeaderboardMissedOdd[]): LeaderboardMissedOutcomeOddGroup[] => {
    const groups = new Map<string, LeaderboardMissedOutcomeOddGroup>();
    for (const entry of sortMissedOdds(entries)) {
      const group = groups.get(entry.fixture.id) ?? {
        id: entry.fixture.id,
        fixture: entry.fixture,
        odd: entry.odd,
        entries: [],
      };
      group.entries.push(entry);
      groups.set(entry.fixture.id, group);
    }
    return [...groups.values()].sort((a, b) => compareFixturesByKickoff(b.fixture, a.fixture));
  };
  const lowestMissedOdd = Math.min(...missedOddCandidates.map((entry) => entry.odd));
  const lowestMissedOutcomeOdd = Math.min(...missedOutcomeOddCandidates.map((entry) => entry.odd));
  const highestMissedOutcomeOdd = Math.max(0, ...missedOutcomeOddCandidates.map((entry) => entry.odd));
  const topTotalPoints = Math.max(0, ...pointsByFixture.map((entry) => entry.totalPoints));
  const matchStats = {
    topScoring:
      topTotalPoints > 0
        ? [...pointsByFixture]
            .filter((entry) => entry.totalPoints > 0)
            .sort((a, b) => {
              if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
              return compareFixturesByKickoff(a.fixture, b.fixture);
            })
            .slice(0, 5)
        : [],
    zeroHitFixtures: pointsByFixture
      .filter((entry) => entry.hitCount === 0)
      .sort((a, b) => compareFixturesByKickoff(b.fixture, a.fixture)),
    lowHitMatches,
    biggestMisses,
    missedOdds: {
      lowest: Number.isFinite(lowestMissedOdd)
        ? sortMissedOdds(missedOddCandidates.filter((entry) => entry.odd === lowestMissedOdd))
        : [],
      lowestOutcome: Number.isFinite(lowestMissedOutcomeOdd)
        ? groupMissedOutcomeOdds(missedOutcomeOddCandidates.filter((entry) => entry.odd === lowestMissedOutcomeOdd))
        : [],
      highestOutcome:
        highestMissedOutcomeOdd > 0
          ? groupMissedOutcomeOdds(missedOutcomeOddCandidates.filter((entry) => entry.odd === highestMissedOutcomeOdd))
          : [],
      highest: sortHighestMissedOdds(missedOddCandidates).slice(0, 5),
    },
    fullyHitFixtures: pointsByFixture
      .filter((entry) => players.length > 0 && entry.hitCount === players.length)
      .sort((a, b) => compareFixturesByKickoff(b.fixture, a.fixture)),
  };

  const fixturesByKickoff = [...fixtures].sort(compareFixturesByKickoff);
  const fixtureOrderIndexById = new Map(fixturesByKickoff.map((fixture, index) => [fixture.id, index]));
  const fixtureIdsWithOdds = new Set<string>();
  for (const odd of odds as Odd[]) {
    if (odd.odd > 0) fixtureIdsWithOdds.add(odd.fixtureId);
  }
  for (const odd of matchOdds as MatchOdd[]) {
    if (odd.homeOdd > 0 || odd.drawOdd > 0 || odd.awayOdd > 0) {
      fixtureIdsWithOdds.add(odd.fixtureId);
    }
  }
  for (const score of scores) {
    fixtureIdsWithOdds.add(score.fixtureId);
  }

  const lastFixtureWithOddsIndex = Math.max(
    -1,
    ...[...fixtureIdsWithOdds].map((fixtureId) => fixtureOrderIndexById.get(fixtureId) ?? -1),
  );
  const lastLockedFixtureIndex = lastFixture
    ? fixtureOrderIndexById.get(lastFixture.id) ?? -1
    : -1;
  const timelineEndIndex = Math.max(lastFixtureWithOddsIndex, lastLockedFixtureIndex);
  const timelineFixtures = timelineEndIndex >= 0
    ? fixturesByKickoff.slice(0, timelineEndIndex + 1)
    : [];

  const runningTotalsByPlayerId = new Map(players.map((player) => [player.id, 0]));
  const timeline = timelineFixtures.map((fixture, index) => {
    const fixtureScores = scoresByFixtureId.get(fixture.id) ?? [];
    const pointsByPlayerId = new Map(players.map((player) => [player.id, 0]));
    for (const score of fixtureScores) {
      pointsByPlayerId.set(
        score.playerId,
        (pointsByPlayerId.get(score.playerId) ?? 0) + score.points,
      );
      runningTotalsByPlayerId.set(
        score.playerId,
        (runningTotalsByPlayerId.get(score.playerId) ?? 0) + score.points,
      );
    }
    return {
      fixture,
      matchNumber: index + 1,
      totalsByPlayerId: Object.fromEntries(
        players.map((player) => [
          player.id,
          roundPoints(runningTotalsByPlayerId.get(player.id) ?? 0),
        ]),
      ),
      pointsByPlayerId: Object.fromEntries(
        players.map((player) => [
          player.id,
          roundPoints(pointsByPlayerId.get(player.id) ?? 0),
        ]),
      ),
      hasOdds: fixtureIdsWithOdds.has(fixture.id),
    };
  });

  const fixtureOrderById = new Map(lockedFixtures.map((fixture, index) => [fixture.id, index]));
  const fullFormByPlayerId = new Map(
    players.map((player) => [
      player.id,
      lockedFixtures.map((fixture) =>
        formEntryForFixture(player.id, fixture, scoreByPlayerFixture, betByPlayerFixture),
      ),
    ]),
  );
  const streaks = {
    points: buildStreak(
      board,
      fullFormByPlayerId,
      (entry) => entry.result === 'exact' || entry.result === 'outcome',
    ),
    exact: buildStreak(board, fullFormByPlayerId, (entry) => entry.result === 'exact'),
    miss: buildStreak(
      board,
      fullFormByPlayerId,
      (entry) => entry.result === 'miss',
      (entries, predicate) =>
        bestMatchingRunIgnoringNeutral(entries, predicate, (entry) => entry.result === 'none'),
    ),
  };
  const groupedEvents = new Map<string, LeaderboardEventGroup>();
  for (const event of scores
    .map((score) => {
      const player = playerMap.get(score.playerId);
      return player
        ? {
            id: String(score.id ?? `${score.playerId}:${score.fixtureId}`),
            player,
            score,
          }
        : null;
    })
    .filter((event): event is LeaderboardEvent => event != null)) {
    const fixture = fixtureMap.get(event.score.fixtureId);
    if (!fixture) continue;

    const pointType = event.score.pointType === 'outcome' ? 'outcome' : 'exact';
    const key = `${fixture.id}:${pointType}`;
    const group = groupedEvents.get(key) ?? {
      id: key,
      fixture,
      pointType,
      events: [],
    };
    group.events.push(event);
    groupedEvents.set(key, group);
  }

  const recentEvents = [...groupedEvents.values()]
    .map((group) => ({
      ...group,
      events: [...group.events].sort((a, b) => {
        if (b.score.points !== a.score.points) return b.score.points - a.score.points;
        return a.player.name.localeCompare(b.player.name, 'pl-PL');
      }),
    }))
    .sort((a, b) => {
      const fixtureDelta =
        (fixtureOrderById.get(b.fixture.id) ?? -1) - (fixtureOrderById.get(a.fixture.id) ?? -1);
      if (fixtureDelta !== 0) return fixtureDelta;
      if (a.pointType !== b.pointType) return a.pointType === 'exact' ? -1 : 1;
      return a.fixture.id.localeCompare(b.fixture.id);
    })
    .slice(0, 10);

  const sortedBestHits = scores
    .map((score) => {
      const player = playerMap.get(score.playerId);
      const fixture = fixtureMap.get(score.fixtureId);
      if (!player || !fixture) return null;

      return {
        id: String(score.id ?? `${score.playerId}:${score.fixtureId}`),
        player,
        fixture,
        points: roundPoints(score.points),
        betHomeScore: score.betHomeScore,
        betAwayScore: score.betAwayScore,
        resultHomeScore: score.resultHomeScore,
        resultAwayScore: score.resultAwayScore,
        pointType: score.pointType === 'outcome' ? 'outcome' : 'exact',
      } satisfies LeaderboardBestHit;
    })
    .filter((hit): hit is LeaderboardBestHit => hit != null)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const fixtureDelta = compareFixturesByKickoff(b.fixture, a.fixture);
      if (fixtureDelta !== 0) return fixtureDelta;
      if (a.pointType !== b.pointType) return a.pointType === 'exact' ? -1 : 1;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    });
  const bestHits = takeBestHitsWithCutoffGroup(sortedBestHits, 10);

  return {
    board,
    lockedCount: lockedFixtures.length,
    totalFixtures,
    lastFixture,
    timeline,
    recentEvents,
    bestHits,
    almostHits,
    streaks,
    matchStats,
  };
}
