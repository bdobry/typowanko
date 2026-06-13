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
}

export interface LeaderboardTimelinePoint {
  fixture: Fixture;
  matchNumber: number;
  totalsByPlayerId: Record<string, number>;
}

export interface LeaderboardEvent {
  id: string;
  player: Player;
  fixture: Fixture;
  score: StoredScoreEntry;
}

export interface LeaderboardData {
  board: LeaderboardRow[];
  lockedCount: number;
  totalFixtures: number;
  lastFixture: Fixture | null;
  timeline: LeaderboardTimelinePoint[];
  recentEvents: LeaderboardEvent[];
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
  const betKeySet = new Set(bets.map((bet) => `${bet.playerId}:${bet.fixtureId}`));

  return sortRows(
    players.map((player) => {
      const history = scoresByPlayerId.get(player.id) ?? [];
      const scoreByFixtureId = new Map(history.map((score) => [score.fixtureId, score]));
      const total = history.reduce((acc, score) => acc + score.points, 0);
      return {
        player,
        total: roundPoints(total),
        history,
        exactHits: history.filter((score) => score.pointType !== 'outcome').length,
        outcomeHits: history.filter((score) => score.pointType === 'outcome').length,
        lastMatchPoints: roundPoints(lastMatchPointsByPlayerId.get(player.id) ?? 0),
        recentForm: recentFixtures.map((fixture) => {
          if (fixture.status !== 'locked') {
            return {
              fixture,
              result: 'upcoming' as const,
              points: 0,
            };
          }

          const score = scoreByFixtureId.get(fixture.id);
          const hasBet = betKeySet.has(`${player.id}:${fixture.id}`);
          return {
            fixture,
            result: score?.pointType === 'outcome' ? 'outcome' : score ? 'exact' : hasBet ? 'miss' : 'none',
            points: roundPoints(score?.points ?? 0),
          };
        }),
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
  const recentEvents = scores
    .map((score) => {
      const fixture = fixtureMap.get(score.fixtureId);
      const player = playerMap.get(score.playerId);
      return fixture && player
        ? {
            id: String(score.id ?? `${score.playerId}:${score.fixtureId}`),
            player,
            fixture,
            score,
          }
        : null;
    })
    .filter((event): event is LeaderboardEvent => event != null)
    .sort((a, b) => {
      const fixtureDelta =
        (fixtureOrderById.get(b.fixture.id) ?? -1) - (fixtureOrderById.get(a.fixture.id) ?? -1);
      if (fixtureDelta !== 0) return fixtureDelta;
      if (b.score.points !== a.score.points) return b.score.points - a.score.points;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    })
    .slice(0, 10);

  return {
    board,
    lockedCount: lockedFixtures.length,
    totalFixtures,
    lastFixture,
    timeline,
    recentEvents,
  };
}
