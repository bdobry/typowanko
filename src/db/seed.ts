import { db } from '../db';
import { WC2026_FIXTURES } from '../data/fixtures2026';

export async function seedFixtures() {
  const count = await db.fixtures.count();
  if (count === 0) {
    await db.fixtures.bulkAdd(
      WC2026_FIXTURES.map((f) => ({ ...f, status: 'upcoming' as const }))
    );
  }
}
