export type KnockoutFixtureLike = {
  id?: unknown;
  num?: unknown;
  homeTeam?: unknown;
  awayTeam?: unknown;
  status?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  winnerTeam?: unknown;
};

export type KnockoutFixtureTeamUpdate = {
  id: string;
  homeTeam: string;
  awayTeam: string;
};

type SlotKind = 'winner' | 'loser';

type KnockoutSlotRef = {
  kind: SlotKind;
  sourceNum: number;
};

type KnockoutSlotRule = {
  targetNum: number;
  home: KnockoutSlotRef;
  away: KnockoutSlotRef;
};

export const ROUND_OF_32_TEAM_UPDATES: Record<number, { homeTeam: string; awayTeam: string }> = {
  73: { homeTeam: 'South Africa', awayTeam: 'Canada' },
  74: { homeTeam: 'Germany', awayTeam: 'Paraguay' },
  75: { homeTeam: 'Netherlands', awayTeam: 'Morocco' },
  76: { homeTeam: 'Brazil', awayTeam: 'Japan' },
  77: { homeTeam: 'France', awayTeam: 'Sweden' },
  78: { homeTeam: 'Ivory Coast', awayTeam: 'Norway' },
  79: { homeTeam: 'Mexico', awayTeam: 'Ecuador' },
  80: { homeTeam: 'England', awayTeam: 'DR Congo' },
  81: { homeTeam: 'USA', awayTeam: 'Bosnia & Herzegovina' },
  82: { homeTeam: 'Belgium', awayTeam: 'Senegal' },
  83: { homeTeam: 'Portugal', awayTeam: 'Croatia' },
  84: { homeTeam: 'Spain', awayTeam: 'Austria' },
  85: { homeTeam: 'Switzerland', awayTeam: 'Algeria' },
  86: { homeTeam: 'Argentina', awayTeam: 'Cape Verde' },
  87: { homeTeam: 'Colombia', awayTeam: 'Ghana' },
  88: { homeTeam: 'Australia', awayTeam: 'Egypt' },
};

const KNOCKOUT_SLOT_RULES: readonly KnockoutSlotRule[] = [
  { targetNum: 89, home: { kind: 'winner', sourceNum: 74 }, away: { kind: 'winner', sourceNum: 77 } },
  { targetNum: 90, home: { kind: 'winner', sourceNum: 73 }, away: { kind: 'winner', sourceNum: 75 } },
  { targetNum: 91, home: { kind: 'winner', sourceNum: 76 }, away: { kind: 'winner', sourceNum: 78 } },
  { targetNum: 92, home: { kind: 'winner', sourceNum: 79 }, away: { kind: 'winner', sourceNum: 80 } },
  { targetNum: 93, home: { kind: 'winner', sourceNum: 83 }, away: { kind: 'winner', sourceNum: 84 } },
  { targetNum: 94, home: { kind: 'winner', sourceNum: 81 }, away: { kind: 'winner', sourceNum: 82 } },
  { targetNum: 95, home: { kind: 'winner', sourceNum: 86 }, away: { kind: 'winner', sourceNum: 88 } },
  { targetNum: 96, home: { kind: 'winner', sourceNum: 85 }, away: { kind: 'winner', sourceNum: 87 } },
  { targetNum: 97, home: { kind: 'winner', sourceNum: 89 }, away: { kind: 'winner', sourceNum: 90 } },
  { targetNum: 98, home: { kind: 'winner', sourceNum: 93 }, away: { kind: 'winner', sourceNum: 94 } },
  { targetNum: 99, home: { kind: 'winner', sourceNum: 91 }, away: { kind: 'winner', sourceNum: 92 } },
  { targetNum: 100, home: { kind: 'winner', sourceNum: 95 }, away: { kind: 'winner', sourceNum: 96 } },
  { targetNum: 101, home: { kind: 'winner', sourceNum: 97 }, away: { kind: 'winner', sourceNum: 98 } },
  { targetNum: 102, home: { kind: 'winner', sourceNum: 99 }, away: { kind: 'winner', sourceNum: 100 } },
  { targetNum: 103, home: { kind: 'loser', sourceNum: 101 }, away: { kind: 'loser', sourceNum: 102 } },
  { targetNum: 104, home: { kind: 'winner', sourceNum: 101 }, away: { kind: 'winner', sourceNum: 102 } },
];

type WorkingFixture = {
  id: string;
  num: number | null;
  homeTeam: string;
  awayTeam: string;
  status: unknown;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: 'home' | 'away' | null;
};

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function winnerValue(value: unknown) {
  return value === 'home' || value === 'away' ? value : null;
}

function fixtureNumber(fixture: KnockoutFixtureLike) {
  const explicit = numberValue(fixture.num);
  if (explicit != null) return explicit;

  const id = stringValue(fixture.id);
  const match = id?.match(/_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalizeFixture(fixture: KnockoutFixtureLike): WorkingFixture | null {
  const id = stringValue(fixture.id);
  const homeTeam = stringValue(fixture.homeTeam);
  const awayTeam = stringValue(fixture.awayTeam);
  if (!id || !homeTeam || !awayTeam) return null;

  return {
    id,
    num: fixtureNumber(fixture),
    homeTeam,
    awayTeam,
    status: fixture.status,
    homeScore: numberValue(fixture.homeScore),
    awayScore: numberValue(fixture.awayScore),
    winnerTeam: winnerValue(fixture.winnerTeam),
  };
}

function resolvedSlotTeam(fixturesByNum: Map<number, WorkingFixture>, slot: KnockoutSlotRef) {
  const source = fixturesByNum.get(slot.sourceNum);
  if (
    !source ||
    source.status !== 'locked' ||
    source.homeScore == null ||
    source.awayScore == null
  ) {
    return null;
  }

  if (source.winnerTeam === 'home') return source.homeTeam;
  if (source.winnerTeam === 'away') return source.awayTeam;
  if (source.homeScore === source.awayScore) return null;

  const homeAdvanced =
    slot.kind === 'winner'
      ? source.homeScore > source.awayScore
      : source.homeScore < source.awayScore;
  return homeAdvanced ? source.homeTeam : source.awayTeam;
}

export function buildKnockoutFixtureUpdates(
  fixtures: readonly KnockoutFixtureLike[],
): KnockoutFixtureTeamUpdate[] {
  const workingFixtures = fixtures
    .map((fixture) => normalizeFixture(fixture))
    .filter((fixture): fixture is WorkingFixture => fixture != null);
  const fixturesByNum = new Map(
    workingFixtures
      .map((fixture) => (fixture.num == null ? null : [fixture.num, fixture] as const))
      .filter((entry): entry is readonly [number, WorkingFixture] => entry != null),
  );
  const updatesById = new Map<string, KnockoutFixtureTeamUpdate>();

  function setFixtureTeams(fixture: WorkingFixture, homeTeam: string, awayTeam: string) {
    if (fixture.homeTeam === homeTeam && fixture.awayTeam === awayTeam) return;
    fixture.homeTeam = homeTeam;
    fixture.awayTeam = awayTeam;
    updatesById.set(fixture.id, { id: fixture.id, homeTeam, awayTeam });
  }

  for (const [matchNum, teams] of Object.entries(ROUND_OF_32_TEAM_UPDATES)) {
    const fixture = fixturesByNum.get(Number(matchNum));
    if (!fixture) continue;
    setFixtureTeams(fixture, teams.homeTeam, teams.awayTeam);
  }

  for (const rule of KNOCKOUT_SLOT_RULES) {
    const fixture = fixturesByNum.get(rule.targetNum);
    if (!fixture) continue;
    const homeTeam = resolvedSlotTeam(fixturesByNum, rule.home) ?? fixture.homeTeam;
    const awayTeam = resolvedSlotTeam(fixturesByNum, rule.away) ?? fixture.awayTeam;
    setFixtureTeams(
      fixture,
      homeTeam,
      awayTeam,
    );
  }

  return [...updatesById.values()];
}

export function applyKnockoutFixtureUpdates<T extends KnockoutFixtureLike>(
  fixtures: readonly T[],
): T[] {
  const updates = buildKnockoutFixtureUpdates(fixtures);
  if (updates.length === 0) return [...fixtures];

  const updatesById = new Map(updates.map((update) => [update.id, update]));
  return fixtures.map((fixture) => {
    const id = stringValue(fixture.id);
    const update = id ? updatesById.get(id) : undefined;
    return update ? ({ ...fixture, homeTeam: update.homeTeam, awayTeam: update.awayTeam } as T) : fixture;
  });
}
