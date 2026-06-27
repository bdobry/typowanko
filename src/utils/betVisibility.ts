import type { Fixture } from '../db';
import { hasFixtureStarted } from './fixtureTime';

export function areFixtureBetsPublic(
  fixture: Pick<Fixture, 'status' | 'date' | 'utcTime'>,
  now = Date.now(),
) {
  return fixture.status === 'locked' || hasFixtureStarted(fixture, now);
}

export function shouldHideKnownBetScore({
  fixture,
  betPlayerId,
  currentPlayerId,
  hideOtherBetsLocally,
  now = Date.now(),
}: {
  fixture: Pick<Fixture, 'status' | 'date' | 'utcTime' | 'hideBetsUntilKickoff'>;
  betPlayerId: string;
  currentPlayerId?: string | null;
  hideOtherBetsLocally: boolean;
  now?: number;
}) {
  if (areFixtureBetsPublic(fixture, now)) return false;
  if (currentPlayerId && betPlayerId === currentPlayerId) return false;
  return hideOtherBetsLocally || fixture.hideBetsUntilKickoff === true;
}

export function hideOtherBetsStorageKey(leagueId: string | undefined, playerId: string | null) {
  return `typowanko.hideOtherBets:${leagueId ?? 'local'}:${playerId ?? 'unknown'}`;
}

export function readHideOtherBetsPreference(storageKey: string | null) {
  return storageKey ? localStorage.getItem(storageKey) === '1' : false;
}
