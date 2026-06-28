import { db, type Fixture, type TypowankoDb } from '../db';
import { WC2026_FIXTURES } from '../data/fixtures2026';
import { buildKnockoutFixtureUpdates } from '../utils/knockoutBracket';
import {
  applyKnownFixtureCorrections,
  buildKnownFixtureCorrections,
} from '../utils/fixtureCorrections';

export async function seedFixtures(targetDb: TypowankoDb = db) {
  const count = await targetDb.fixtures.count();
  if (count === 0) {
    await targetDb.fixtures.bulkAdd(
      WC2026_FIXTURES.map((f) => ({ ...f, status: 'upcoming' as const }))
    );
  }

  return syncKnockoutFixtures(targetDb);
}

export async function syncKnockoutFixtures(targetDb: TypowankoDb = db) {
  const fixtures = await targetDb.fixtures.toArray();
  const correctionUpdates = buildKnownFixtureCorrections(fixtures);
  const correctedFixtures = applyKnownFixtureCorrections(fixtures);
  const teamUpdates = buildKnockoutFixtureUpdates(correctedFixtures);
  const updateById = new Map<string, Partial<Pick<Fixture, 'date' | 'utcTime' | 'homeTeam' | 'awayTeam'>>>();

  for (const update of correctionUpdates) {
    updateById.set(update.id, {
      ...updateById.get(update.id),
      date: update.date,
      utcTime: update.utcTime,
    });
  }

  for (const update of teamUpdates) {
    updateById.set(update.id, {
      ...updateById.get(update.id),
      homeTeam: update.homeTeam,
      awayTeam: update.awayTeam,
    });
  }

  const updates = [...updateById.entries()];
  if (updates.length === 0) return [];

  await targetDb.transaction('rw', targetDb.fixtures, async () => {
    for (const [fixtureId, update] of updates) {
      await targetDb.fixtures.update(
        fixtureId,
        Object.fromEntries(
          Object.entries(update).filter((entry): entry is [string, string] => entry[1] != null),
        ),
      );
    }
  });

  return updates.map(([fixtureId]) => fixtureId);
}
