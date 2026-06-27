import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeHiddenFixtureBetsFromCloud,
  redactSnapshotForAuth,
  type RedactableSnapshot,
} from './betVisibility.ts';

const BEFORE_KICKOFF = Date.parse('2026-06-01T10:00:00Z');
const AFTER_KICKOFF = Date.parse('2026-06-01T12:01:00Z');

function baseSnapshot(): RedactableSnapshot {
  return {
    players: [{ id: 'p1' }, { id: 'p2' }],
    fixtures: [
      {
        id: 'm1',
        date: '2026-06-01',
        utcTime: '12:00',
        status: 'upcoming',
        hideBetsUntilKickoff: true,
      },
    ],
    bets: [
      {
        id: 1,
        playerId: 'p1',
        fixtureId: 'm1',
        homeScore: 2,
        awayScore: 1,
        updatedAt: 100,
        updatedBy: 'player',
      },
      {
        id: 2,
        playerId: 'p2',
        fixtureId: 'm1',
        homeScore: 0,
        awayScore: 0,
        updatedAt: 200,
        updatedBy: 'player',
      },
    ],
  };
}

describe('bet visibility redaction', () => {
  it('hides all concrete bet scores from host before kickoff', () => {
    const result = redactSnapshotForAuth(
      baseSnapshot(),
      { role: 'host', code: 'host-code' },
      BEFORE_KICKOFF,
    );

    assert.deepEqual(result.snapshot.bets, []);
    assert.deepEqual(result.hiddenBets, [
      { playerId: 'p1', fixtureId: 'm1', updatedAt: 100, updatedBy: 'player' },
      { playerId: 'p2', fixtureId: 'm1', updatedAt: 200, updatedBy: 'player' },
    ]);
  });

  it('keeps only the current player concrete score before kickoff', () => {
    const result = redactSnapshotForAuth(
      baseSnapshot(),
      { role: 'player', playerId: 'p1', code: 'player-code' },
      BEFORE_KICKOFF,
    );

    assert.deepEqual(result.snapshot.bets.map((bet) => bet.playerId), ['p1']);
    assert.equal(result.snapshot.bets[0]?.homeScore, 2);
    assert.deepEqual(result.hiddenBets, [
      { playerId: 'p2', fixtureId: 'm1', updatedAt: 200, updatedBy: 'player' },
    ]);
  });

  it('reveals concrete bet scores after kickoff even if the hide flag remains set', () => {
    const result = redactSnapshotForAuth(
      baseSnapshot(),
      { role: 'host', code: 'host-code' },
      AFTER_KICKOFF,
    );

    assert.equal(result.snapshot.bets.length, 2);
    assert.deepEqual(result.hiddenBets, []);
  });

  it('reveals concrete bet scores for locked fixtures', () => {
    const snapshot = baseSnapshot();
    snapshot.fixtures[0] = {
      ...snapshot.fixtures[0],
      status: 'locked',
    };

    const result = redactSnapshotForAuth(
      snapshot,
      { role: 'viewer', code: 'viewer-code' },
      BEFORE_KICKOFF,
    );

    assert.equal(result.snapshot.bets.length, 2);
    assert.deepEqual(result.hiddenBets, []);
  });
});

describe('hidden cloud bet preservation', () => {
  it('re-adds redacted cloud bets before saving a host snapshot', () => {
    const incomingSnapshot = baseSnapshot();
    incomingSnapshot.bets = [
      {
        id: 1,
        playerId: 'p1',
        fixtureId: 'm1',
        homeScore: 3,
        awayScore: 2,
        updatedAt: 300,
        updatedBy: 'host',
      },
    ];

    mergeHiddenFixtureBetsFromCloud(incomingSnapshot, baseSnapshot());

    assert.deepEqual(
      incomingSnapshot.bets.map((bet) => `${bet.playerId}:${bet.homeScore}:${bet.awayScore}`),
      ['p1:3:2', 'p2:0:0'],
    );
  });

  it('does not restore hidden bets for players removed by host', () => {
    const incomingSnapshot = baseSnapshot();
    incomingSnapshot.players = [{ id: 'p1' }];
    incomingSnapshot.bets = [];

    mergeHiddenFixtureBetsFromCloud(incomingSnapshot, baseSnapshot());

    assert.deepEqual(
      incomingSnapshot.bets.map((bet) => bet.playerId),
      ['p1'],
    );
  });
});
