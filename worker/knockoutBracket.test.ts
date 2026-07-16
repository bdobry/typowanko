import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnockoutFixtureUpdates } from '../src/utils/knockoutBracket.ts';

test('uses semifinal losers for the third-place match', () => {
  const updates = buildKnockoutFixtureUpdates([
    { id: 'SF_101', num: 101, homeTeam: 'Team A', awayTeam: 'Team B', status: 'locked', homeScore: 2, awayScore: 1, winnerTeam: 'home' },
    { id: 'SF_102', num: 102, homeTeam: 'Team C', awayTeam: 'Team D', status: 'locked', homeScore: 0, awayScore: 1, winnerTeam: 'away' },
    { id: 'TP_103', num: 103, homeTeam: 'L101', awayTeam: 'L102', status: 'upcoming' },
    { id: 'FIN_104', num: 104, homeTeam: 'W101', awayTeam: 'W102', status: 'upcoming' },
  ]);

  assert.deepEqual(updates, [
    { id: 'TP_103', homeTeam: 'Team B', awayTeam: 'Team C' },
    { id: 'FIN_104', homeTeam: 'Team A', awayTeam: 'Team D' },
  ]);
});

test('uses semifinal winners and losers when advancement was decided on penalties', () => {
  const updates = buildKnockoutFixtureUpdates([
    { id: 'SF_101', num: 101, homeTeam: 'Team A', awayTeam: 'Team B', status: 'locked', homeScore: 1, awayScore: 1, winnerTeam: 'away' },
    { id: 'SF_102', num: 102, homeTeam: 'Team C', awayTeam: 'Team D', status: 'locked', homeScore: 2, awayScore: 2, winnerTeam: 'home' },
    { id: 'TP_103', num: 103, homeTeam: 'L101', awayTeam: 'L102', status: 'upcoming' },
    { id: 'FIN_104', num: 104, homeTeam: 'W101', awayTeam: 'W102', status: 'upcoming' },
  ]);

  assert.deepEqual(updates, [
    { id: 'TP_103', homeTeam: 'Team A', awayTeam: 'Team D' },
    { id: 'FIN_104', homeTeam: 'Team B', awayTeam: 'Team C' },
  ]);
});
