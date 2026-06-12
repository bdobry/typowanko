import { db, type TypowankoDb } from '../db';
import { WC2026_FIXTURES } from '../data/fixtures2026';

export async function seedFixtures(targetDb: TypowankoDb = db) {
  const count = await targetDb.fixtures.count();
  if (count === 0) {
    await targetDb.fixtures.bulkAdd(
      WC2026_FIXTURES.map((f) => ({ ...f, status: 'upcoming' as const }))
    );
  }
}
