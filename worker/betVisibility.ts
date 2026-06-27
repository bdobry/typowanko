export type RedactableFixtureRecord = {
  id?: unknown;
  date?: unknown;
  utcTime?: unknown;
  status?: unknown;
  hideBetsUntilKickoff?: unknown;
};

export type RedactableBetRecord = {
  id?: number;
  playerId?: unknown;
  fixtureId?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
  updatedAt?: number;
  updatedBy?: 'host' | 'player';
};

export type RedactablePlayerRecord = {
  id?: unknown;
};

export type RedactableSnapshot = {
  players: RedactablePlayerRecord[];
  fixtures: RedactableFixtureRecord[];
  bets: RedactableBetRecord[];
};

export type RedactionAuth =
  | { role: 'host' | 'viewer'; code?: string }
  | { role: 'player'; code?: string; playerId: string };

export type HiddenBetRecord = {
  playerId: string;
  fixtureId: string;
  updatedAt?: number;
  updatedBy?: 'host' | 'player';
};

function fixtureKickoffMs(fixture: RedactableFixtureRecord) {
  if (typeof fixture.date !== 'string') return Number.POSITIVE_INFINITY;
  const time = typeof fixture.utcTime === 'string' ? fixture.utcTime : '23:59';
  const timestamp = Date.parse(`${fixture.date}T${time}:00Z`);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function hasFixtureStarted(fixture: RedactableFixtureRecord, now: number) {
  return now >= fixtureKickoffMs(fixture);
}

function shouldHideFixtureBets(fixture: RedactableFixtureRecord, now: number) {
  return (
    fixture.hideBetsUntilKickoff === true &&
    fixture.status !== 'locked' &&
    !hasFixtureStarted(fixture, now)
  );
}

function betKey(bet: RedactableBetRecord) {
  return typeof bet.playerId === 'string' && typeof bet.fixtureId === 'string'
    ? `${bet.playerId}:${bet.fixtureId}`
    : null;
}

function playerIdsFromSnapshot(snapshot: RedactableSnapshot) {
  return snapshot.players
    .map((player) => (typeof player.id === 'string' ? player.id : null))
    .filter((id): id is string => Boolean(id));
}

function shouldPreserveCloudBetsForFixture(fixture: RedactableFixtureRecord) {
  return fixture.hideBetsUntilKickoff === true && fixture.status !== 'locked';
}

export function mergeHiddenFixtureBetsFromCloud(
  snapshot: RedactableSnapshot,
  cloudSnapshot: RedactableSnapshot,
) {
  const incomingPlayerIds = new Set(playerIdsFromSnapshot(snapshot));
  const preserveFixtureIds = new Set<string>();

  for (const fixture of cloudSnapshot.fixtures) {
    if (typeof fixture.id === 'string' && shouldPreserveCloudBetsForFixture(fixture)) {
      preserveFixtureIds.add(fixture.id);
    }
  }

  for (const fixture of snapshot.fixtures) {
    if (typeof fixture.id === 'string' && shouldPreserveCloudBetsForFixture(fixture)) {
      preserveFixtureIds.add(fixture.id);
    }
  }

  if (preserveFixtureIds.size === 0) return;

  const existingKeys = new Set(
    snapshot.bets
      .map((bet) => betKey(bet))
      .filter((key): key is string => key != null),
  );

  for (const cloudBet of cloudSnapshot.bets) {
    if (typeof cloudBet.fixtureId !== 'string' || typeof cloudBet.playerId !== 'string') continue;
    if (!preserveFixtureIds.has(cloudBet.fixtureId)) continue;
    if (!incomingPlayerIds.has(cloudBet.playerId)) continue;

    const key = betKey(cloudBet);
    if (!key || existingKeys.has(key)) continue;
    snapshot.bets.push(cloudBet);
    existingKeys.add(key);
  }
}

export function redactSnapshotForAuth(snapshot: RedactableSnapshot, auth: RedactionAuth, now: number) {
  const hiddenFixtureIds = new Set(
    snapshot.fixtures
      .filter((fixture) => typeof fixture.id === 'string' && shouldHideFixtureBets(fixture, now))
      .map((fixture) => fixture.id as string),
  );

  if (hiddenFixtureIds.size === 0) {
    return { snapshot, hiddenBets: [] as HiddenBetRecord[] };
  }

  const visibleBets: RedactableBetRecord[] = [];
  const hiddenBets: HiddenBetRecord[] = [];

  for (const bet of snapshot.bets) {
    if (typeof bet.fixtureId !== 'string' || typeof bet.playerId !== 'string') {
      visibleBets.push(bet);
      continue;
    }

    if (!hiddenFixtureIds.has(bet.fixtureId)) {
      visibleBets.push(bet);
      continue;
    }

    if (auth.role === 'player' && bet.playerId === auth.playerId) {
      visibleBets.push(bet);
      continue;
    }

    hiddenBets.push({
      playerId: bet.playerId,
      fixtureId: bet.fixtureId,
      updatedAt: bet.updatedAt,
      updatedBy: bet.updatedBy,
    });
  }

  return {
    snapshot: {
      ...snapshot,
      bets: visibleBets,
    },
    hiddenBets,
  };
}
