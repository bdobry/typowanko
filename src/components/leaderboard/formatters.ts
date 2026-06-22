import type { Fixture } from '../../db';
import type { LeaderboardEventGroup, LeaderboardFormEntry } from '../../utils/scoring';
import { displayTeamName } from '../../utils/displayNames';

export function formatPoints(value: number) {
  return value.toFixed(2);
}

export function shortDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  });
}

export function fixtureTeamsLabel(fixture: Pick<Fixture, 'homeTeam' | 'awayTeam'>) {
  return `${displayTeamName(fixture.homeTeam)} – ${displayTeamName(fixture.awayTeam)}`;
}

export function fixtureLabel(event: LeaderboardEventGroup) {
  return fixtureTeamsLabel(event.fixture);
}

export function fixtureResultLabel(event: LeaderboardEventGroup) {
  if (event.fixture.homeScore == null || event.fixture.awayScore == null) {
    return fixtureLabel(event);
  }

  return `${displayTeamName(event.fixture.homeTeam)} ${event.fixture.homeScore}:${event.fixture.awayScore} ${displayTeamName(event.fixture.awayTeam)}`;
}

export function fixtureScoreLabel(fixture: Fixture) {
  if (fixture.homeScore == null || fixture.awayScore == null) {
    return fixtureTeamsLabel(fixture);
  }

  return `${displayTeamName(fixture.homeTeam)} ${fixture.homeScore}:${fixture.awayScore} ${displayTeamName(fixture.awayTeam)}`;
}

export function scoreTypeLabel(event: LeaderboardEventGroup) {
  return event.pointType === 'outcome' ? 'trafiony 1X2' : 'dokładny wynik';
}

export function formResultLabel(result: LeaderboardFormEntry['result'], points: number) {
  if (result === 'upcoming') return 'Najbliższy mecz';
  if (result === 'none') return 'Brak obstawienia';
  if (result === 'miss') return 'Nietrafione';
  return `${result === 'exact' ? 'Dokładny wynik' : 'Trafiony W/D/L'} +${formatPoints(points)} pkt`;
}

export function matchCountLabel(count: number) {
  if (count === 1) return '1 mecz';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} mecze`;
  }
  return `${count} meczów`;
}

export function hitCountLabel(count: number) {
  if (count === 1) return '1 trafienie';
  return `${count} trafień`;
}
