import { db } from '../db';
import { fetchMatchResult } from './footballDataApi';
import { fixtureAutoResultEligibleAtMs } from './fixtureTime';
import { getApiFootballKey } from './oddsApi';
import { recalcFixture } from './scoring';
import { syncKnockoutFixtures } from '../db/seed';

type FixtureResultRefreshCandidate = {
  status: string;
  homeScore?: number;
  awayScore?: number;
  winnerTeam?: string;
  num?: number;
  date: string;
  utcTime?: string;
};

export function needsResultRefresh(
  fixture: FixtureResultRefreshCandidate,
  now = Date.now(),
) {
  if (
    Number.isFinite(fixtureAutoResultEligibleAtMs(fixture)) &&
    now >= fixtureAutoResultEligibleAtMs(fixture) &&
    fixture.status !== 'locked'
  ) {
    return true;
  }

  return (
    fixture.status === 'locked' &&
    fixture.num != null &&
    fixture.homeScore != null &&
    fixture.awayScore != null &&
    fixture.homeScore === fixture.awayScore &&
    fixture.winnerTeam !== 'home' &&
    fixture.winnerTeam !== 'away' &&
    Number.isFinite(fixtureAutoResultEligibleAtMs(fixture)) &&
    now >= fixtureAutoResultEligibleAtMs(fixture)
  );
}

export async function refreshLocalCompletedResults(now = Date.now()) {
  const apiKey = getApiFootballKey();
  if (!apiKey) return [];

  await syncKnockoutFixtures();
  const fixtures = await db.fixtures.toArray();
  const candidates = fixtures.filter((fixture) => needsResultRefresh(fixture, now));

  const lockedFixtureIds: string[] = [];
  const winnerUpdatedFixtureIds: string[] = [];
  for (const fixture of candidates) {
    try {
      const result = await fetchMatchResult(
        fixture.homeTeam,
        fixture.awayTeam,
        fixture.date,
        apiKey,
      );

      if (fixture.status === 'locked') {
        if (!result.winnerTeam) continue;
        await db.fixtures.update(fixture.id, { winnerTeam: result.winnerTeam });
        winnerUpdatedFixtureIds.push(fixture.id);
        continue;
      }

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

  if (lockedFixtureIds.length > 0 || winnerUpdatedFixtureIds.length > 0) {
    await syncKnockoutFixtures();
  }

  return [...lockedFixtureIds, ...winnerUpdatedFixtureIds];
}
