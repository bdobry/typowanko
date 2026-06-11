import { db, type Bet, type Fixture } from '../db';

export function scoreKey(h: number, a: number) {
  return `${h}:${a}`;
}

/** Recalculate and save all scores for a locked fixture */
export async function recalcFixture(fixture: Fixture) {
  if (fixture.homeScore == null || fixture.awayScore == null) return;
  const { homeScore: rh, awayScore: ra } = fixture;

  // Find the odd for this exact score
  const odd = await db.odds
    .where('[fixtureId+homeScore+awayScore]')
    .equals([fixture.id, rh, ra])
    .first();
  const oddValue = odd?.odd ?? 0;

  // Get all bets for this fixture
  const bets: Bet[] = await db.bets.where('fixtureId').equals(fixture.id).toArray();

  // Remove old scores for this fixture
  await db.scores.where('fixtureId').equals(fixture.id).delete();

  // Add new scores for correct bets
  const correctBets = bets.filter((b) => b.homeScore === rh && b.awayScore === ra);
  await db.scores.bulkAdd(
    correctBets.map((b) => ({
      playerId: b.playerId,
      fixtureId: fixture.id,
      points: oddValue,
      betHomeScore: b.homeScore,
      betAwayScore: b.awayScore,
      resultHomeScore: rh,
      resultAwayScore: ra,
      odd: oddValue,
    }))
  );
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
