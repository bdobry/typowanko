import { db, type Bet, type Fixture } from '../db';

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
  const [players, allScores] = await Promise.all([
    db.players.toArray(),
    db.scores.toArray(),
  ]);

  return players
    .map((p) => {
      const entries = allScores.filter((s) => s.playerId === p.id);
      const total = entries.reduce((acc, s) => acc + s.points, 0);
      return { player: p, total: Math.round(total * 100) / 100, history: entries };
    })
    .sort((a, b) => b.total - a.total);
}
