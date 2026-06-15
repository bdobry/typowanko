import { db, type Bet, type Fixture, type Player, type ScoreEntry } from '../db';
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

export interface LeaderboardData {
  board: LeaderboardRow[];
  lockedCount: number;
  totalFixtures: number;
  lastFixture: Fixture | null;
  timeline: LeaderboardTimelinePoint[];
  recentEvents: LeaderboardEventGroup[];
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

function buildStreak(
  rows: LeaderboardRow[],
  fullFormByPlayerId: Map<string, LeaderboardFormEntry[]>,
  predicate: (entry: LeaderboardFormEntry) => boolean,
): LeaderboardStreak {
  let bestLength = 0;
  const winners: LeaderboardStreakWinner[] = [];

  for (const row of rows) {
    const entries = bestMatchingRun(fullFormByPlayerId.get(row.player.id) ?? [], predicate);
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

export async function getLeaderboardData(): Promise<LeaderboardData> {
  const [players, allScores, fixtures, bets] = await Promise.all([
    db.players.toArray(),
    db.scores.toArray(),
    db.fixtures.toArray(),
    db.bets.toArray(),
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
  for (const fixture of lockedFixtures) {
    if (fixture.homeScore == null || fixture.awayScore == null) continue;

    for (const bet of bets.filter((entry) => entry.fixtureId === fixture.id)) {
      const player = playerMap.get(bet.playerId);
      if (!player) continue;
      if (scoreByPlayerFixture.has(`${bet.playerId}:${fixture.id}`)) continue;

      const homeError = Math.abs(bet.homeScore - fixture.homeScore);
      const awayError = Math.abs(bet.awayScore - fixture.awayScore);
      const error = homeError + awayError;
      if (error <= 0) continue;

      biggestMissCandidates.push({
        id: String(bet.id ?? `${bet.playerId}:${fixture.id}`),
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
  const topTotalPoints = Math.max(0, ...pointsByFixture.map((entry) => entry.totalPoints));
  const matchStats = {
    topScoring:
      topTotalPoints > 0
        ? pointsByFixture
            .filter((entry) => entry.totalPoints === topTotalPoints)
            .sort((a, b) => compareFixturesByKickoff(a.fixture, b.fixture))
        : [],
    zeroHitFixtures: pointsByFixture
      .filter((entry) => entry.hitCount === 0)
      .sort((a, b) => compareFixturesByKickoff(b.fixture, a.fixture)),
    lowHitMatches,
    biggestMisses,
  };

  const runningTotalsByPlayerId = new Map(players.map((player) => [player.id, 0]));
  const timeline = lockedFixtures.map((fixture, index) => {
    for (const score of scoresByFixtureId.get(fixture.id) ?? []) {
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
    miss: buildStreak(board, fullFormByPlayerId, (entry) => entry.result === 'miss'),
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

  return {
    board,
    lockedCount: lockedFixtures.length,
    totalFixtures,
    lastFixture,
    timeline,
    recentEvents,
    streaks,
    matchStats,
  };
}
