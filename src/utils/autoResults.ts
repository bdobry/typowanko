import { db } from '../db';
import { fetchMatchResult } from './footballDataApi';
import { fixtureAutoResultEligibleAtMs } from './fixtureTime';
import { getApiFootballKey } from './oddsApi';
import { recalcFixture } from './scoring';
import { syncKnockoutFixtures } from '../db/seed';

export async function refreshLocalCompletedResults(now = Date.now()) {
  const apiKey = getApiFootballKey();
  if (!apiKey) return [];

  await syncKnockoutFixtures();
  const fixtures = await db.fixtures.toArray();
  const candidates = fixtures.filter(
    (fixture) =>
      fixture.status !== 'locked' &&
      Number.isFinite(fixtureAutoResultEligibleAtMs(fixture)) &&
      now >= fixtureAutoResultEligibleAtMs(fixture),
  );

  const lockedFixtureIds: string[] = [];
  for (const fixture of candidates) {
    try {
      const result = await fetchMatchResult(
        fixture.homeTeam,
        fixture.awayTeam,
        fixture.date,
        apiKey,
      );
      const lockedFixture = {
        ...fixture,
        status: 'locked' as const,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winnerTeam: result.winnerTeam,
      };
      await db.fixtures.update(fixture.id, {
        status: lockedFixture.status,
        homeScore: lockedFixture.homeScore,
        awayScore: lockedFixture.awayScore,
        winnerTeam: lockedFixture.winnerTeam,
      });
      await recalcFixture(lockedFixture);
      lockedFixtureIds.push(fixture.id);
    } catch {
      // Keep trying other matches; API data can arrive at different times.
    }
  }

  if (lockedFixtureIds.length > 0) {
    await syncKnockoutFixtures();
  }

  return lockedFixtureIds;
}
