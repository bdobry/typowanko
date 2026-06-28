export type FixtureCorrectionLike = {
  id?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  date?: unknown;
  utcTime?: unknown;
};

export type FixtureCorrectionUpdate = {
  id: string;
  date?: string;
  utcTime?: string;
};

const KNOWN_FIXTURE_CORRECTIONS = [
  {
    id: 'H5',
    homeTeam: 'Cape Verde',
    awayTeam: 'Saudi Arabia',
    from: { date: '2026-06-26', utcTime: '00:00' },
    to: { date: '2026-06-27' },
  },
  {
    id: 'R32_84',
    homeTeam: 'Spain',
    awayTeam: 'Austria',
    from: { date: '2026-07-03', utcTime: '19:00' },
    to: { date: '2026-07-02', utcTime: '19:00' },
  },
] as const;

export function buildKnownFixtureCorrections(
  fixtures: readonly FixtureCorrectionLike[],
): FixtureCorrectionUpdate[] {
  const updates: FixtureCorrectionUpdate[] = [];

  for (const fixture of fixtures) {
    for (const correction of KNOWN_FIXTURE_CORRECTIONS) {
      if (
        fixture.id === correction.id &&
        fixture.homeTeam === correction.homeTeam &&
        fixture.awayTeam === correction.awayTeam &&
        fixture.date === correction.from.date &&
        fixture.utcTime === correction.from.utcTime
      ) {
        updates.push({
          id: correction.id,
          ...correction.to,
        });
      }
    }
  }

  return updates;
}

export function applyKnownFixtureCorrections<T extends FixtureCorrectionLike>(
  fixtures: readonly T[],
): T[] {
  const updates = buildKnownFixtureCorrections(fixtures);
  if (updates.length === 0) return [...fixtures];

  const updatesById = new Map(updates.map((update) => [update.id, update]));
  return fixtures.map((fixture) => {
    const id = typeof fixture.id === 'string' ? fixture.id : null;
    const update = id ? updatesById.get(id) : undefined;
    return update ? ({ ...fixture, ...update } as T) : fixture;
  });
}
