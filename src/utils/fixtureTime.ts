import type { Fixture } from '../db';

export const WARSAW_TIME_ZONE = 'Europe/Warsaw';

type FixtureTimeLike = Pick<Fixture, 'date' | 'utcTime' | 'id' | 'num'>;

export function fixtureKickoffMs(fixture: Pick<Fixture, 'date' | 'utcTime'>) {
  const time = fixture.utcTime ?? '23:59';
  const timestamp = Date.parse(`${fixture.date}T${time}:00Z`);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function hasFixtureStarted(fixture: Pick<Fixture, 'date' | 'utcTime'>, now = Date.now()) {
  return now >= fixtureKickoffMs(fixture);
}

export function fixtureAutoResultEligibleAtMs(fixture: Pick<Fixture, 'date' | 'utcTime'>) {
  return fixtureKickoffMs(fixture) + 2 * 60 * 60 * 1000;
}

export function compareFixturesByKickoff(a: FixtureTimeLike, b: FixtureTimeLike) {
  const kickoffDelta = fixtureKickoffMs(a) - fixtureKickoffMs(b);
  if (kickoffDelta !== 0) return kickoffDelta;

  const aTieBreaker = String(a.num ?? a.id).padStart(4, '0');
  const bTieBreaker = String(b.num ?? b.id).padStart(4, '0');
  return aTieBreaker.localeCompare(bTieBreaker);
}

export function fixtureWarsawDateKey(fixture: Pick<Fixture, 'date' | 'utcTime'>) {
  const kickoff = new Date(fixtureKickoffMs(fixture));
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WARSAW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(kickoff);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return `${valueByType.get('year')}-${valueByType.get('month')}-${valueByType.get('day')}`;
}

export function formatFixtureDateInWarsaw(
  fixture: Pick<Fixture, 'date' | 'utcTime'>,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  },
) {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: WARSAW_TIME_ZONE,
    ...options,
  }).format(new Date(fixtureKickoffMs(fixture)));
}

export function formatFixtureTimeInWarsaw(fixture: Pick<Fixture, 'date' | 'utcTime'>) {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: WARSAW_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fixtureKickoffMs(fixture)));
}
