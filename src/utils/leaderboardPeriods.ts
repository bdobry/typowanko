import type { Fixture } from '../db';
import { displayStageName, displayTeamName } from './displayNames';
import { compareFixturesByKickoff, fixtureKickoffMs } from './fixtureTime';

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
const KNOCKOUT_ROUNDS = [
  'Round of 32',
  'Round of 16',
  'Quarter-final',
  'Semi-final',
  'Third place',
  'Final',
] as const;

export type LeaderboardPeriodCategory = 'quick' | 'group_round' | 'group' | 'knockout';

export interface LeaderboardPeriodOption {
  id: string;
  label: string;
  teamLabel?: string;
  category: LeaderboardPeriodCategory;
  fixtureIds: string[];
  lockedFixtureIds: string[];
}

function lockedFixtureIds(fixtures: Fixture[]) {
  return fixtures.filter((fixture) => fixture.status === 'locked').map((fixture) => fixture.id);
}

function option(
  id: string,
  label: string,
  category: LeaderboardPeriodCategory,
  fixtures: Fixture[],
): LeaderboardPeriodOption {
  const sorted = [...fixtures].sort(compareFixturesByKickoff);
  return {
    id,
    label,
    teamLabel: teamLabel(sorted),
    category,
    fixtureIds: sorted.map((fixture) => fixture.id),
    lockedFixtureIds: lockedFixtureIds(sorted),
  };
}

function isPlaceholderTeam(name: string) {
  return (
    /^\d[A-L]$/.test(name) ||
    /^[WL]\d+$/.test(name) ||
    /^3rd \(/.test(name) ||
    name.trim().toLocaleUpperCase('en-US') === 'TBD'
  );
}

function teamLabel(fixtures: Fixture[]) {
  const teams: string[] = [];
  const seenTeams = new Set<string>();

  for (const fixture of fixtures) {
    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      if (isPlaceholderTeam(team) || seenTeams.has(team)) continue;
      seenTeams.add(team);
      teams.push(displayTeamName(team));
    }
  }

  return teams.length > 0 ? teams.join(', ') : undefined;
}

function groupName(code: string) {
  return `Group ${code}`;
}

function buildGroupRoundByFixtureId(fixtures: Fixture[]) {
  const roundByFixtureId = new Map<string, number>();

  for (const code of GROUP_CODES) {
    const groupFixtures = fixtures
      .filter((fixture) => fixture.group === groupName(code))
      .sort(compareFixturesByKickoff);

    groupFixtures.forEach((fixture, index) => {
      roundByFixtureId.set(fixture.id, Math.floor(index / 2) + 1);
    });
  }

  return roundByFixtureId;
}

export function buildLeaderboardPeriodOptions(
  fixtures: Fixture[],
  now = Date.now(),
): LeaderboardPeriodOption[] {
  const sortedFixtures = [...fixtures].sort(compareFixturesByKickoff);
  const lockedFixtures = sortedFixtures.filter((fixture) => fixture.status === 'locked');
  const lastFiveLockedFixtures = lockedFixtures.slice(-5);
  const recentLockedFixtures = lockedFixtures.filter((fixture) => {
    const kickoff = fixtureKickoffMs(fixture);
    return kickoff <= now && kickoff >= now - DAY_MS;
  });
  const groupRoundByFixtureId = buildGroupRoundByFixtureId(sortedFixtures);
  const groupStageFixtures = sortedFixtures.filter((fixture) => fixture.group != null);

  const quickOptions = [
    option('last-five', 'Ostatnie 5 meczów', 'quick', lastFiveLockedFixtures),
    option('last-24h', 'Ostatnie 24h', 'quick', recentLockedFixtures),
  ];

  const groupRoundOptions = [
    option('group-stage-all', 'Wszystkie mecze grupowe', 'group_round', groupStageFixtures),
    ...[1, 2, 3].map((roundNumber) =>
      option(
        `group-round-${roundNumber}`,
        `Kolejka grupowa ${roundNumber}`,
        'group_round',
        sortedFixtures.filter((fixture) => groupRoundByFixtureId.get(fixture.id) === roundNumber),
      ),
    ),
  ];

  const groupOptions = GROUP_CODES.map((code) =>
    option(
      `group-${code}`,
      displayStageName(groupName(code)),
      'group',
      sortedFixtures.filter((fixture) => fixture.group === groupName(code)),
    ),
  );

  const knockoutOptions = KNOCKOUT_ROUNDS.map((round) =>
    option(
      `knockout-${round.toLocaleLowerCase('en-US').replaceAll(' ', '-')}`,
      displayStageName(round),
      'knockout',
      sortedFixtures.filter((fixture) => fixture.round === round),
    ),
  );

  return [
    ...quickOptions,
    ...groupRoundOptions,
    ...groupOptions,
    ...knockoutOptions,
  ].filter((entry) => entry.category === 'quick' || entry.fixtureIds.length > 0);
}
