import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Bet, type Fixture } from '../db';
import { FixturePanel } from '../components/FixturePanel';
import { Tooltip } from '../components/Tooltip';
import { displayStageName, displayTeamName } from '../utils/displayNames';
import { useSync } from '../sync/syncContextValue';
import { getLeaderboardData } from '../utils/scoring';
import {
  compareFixturesByKickoff,
  fixtureKickoffMs,
  fixtureWarsawDateKey,
  formatFixtureDateInWarsaw,
  formatFixtureTimeInWarsaw,
  hasFixtureStarted,
} from '../utils/fixtureTime';
import { formatPlayerName, leaderIdsFromRows } from '../utils/playerNames';
import {
  hideOtherBetsStorageKey,
  readHideOtherBetsPreference,
  shouldHideKnownBetScore,
} from '../utils/betVisibility';

const NEXT_24H_MS = 24 * 60 * 60 * 1000;

const ROUNDS = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
  'Round of 32','Round of 16','Quarter-final','Semi-final','Third place','Final',
];

function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function statusBadge(status: string, hasStarted: boolean) {
  if (status === 'locked') {
    return (
      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Zakończony</span>
    );
  }

  if (hasStarted) {
    return (
      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">W trakcie</span>
    );
  }

  return (
    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Nadchodzący</span>
  );
}

function betScore(bet: Pick<Bet, 'homeScore' | 'awayScore'>) {
  return `${bet.homeScore}:${bet.awayScore}`;
}

function betOddsKey(bet: Pick<Bet, 'fixtureId' | 'homeScore' | 'awayScore'>) {
  return `${bet.fixtureId}:${bet.homeScore}:${bet.awayScore}`;
}

function fixtureVersusLabel(fixture: Pick<Fixture, 'homeTeam' | 'awayTeam'>) {
  return `${displayTeamName(fixture.homeTeam)} – ${displayTeamName(fixture.awayTeam)}`;
}

function oddLabel(odd: number | undefined) {
  return odd == null ? 'kurs -' : `kurs ${odd.toFixed(2)}`;
}

function isFixtureOngoing(fixture: Pick<Fixture, 'date' | 'utcTime' | 'status'>, now: number) {
  return fixture.status !== 'locked' && hasFixtureStarted(fixture, now);
}

function resultStatusTooltip(fixture: Fixture, hasStarted: boolean) {
  if (fixture.status === 'locked') {
    const score =
      fixture.homeScore != null && fixture.awayScore != null
        ? `${fixture.homeScore}:${fixture.awayScore}`
        : '-';
    const winnerLabel = fixture.winnerTeam === 'home'
      ? fixture.homeTeam
      : fixture.winnerTeam === 'away'
      ? fixture.awayTeam
      : null;
    return (
      <span className="block">
        <span className="block text-sm font-bold">Wynik zapisany</span>
        <span className="block text-gray-200">{score}</span>
        {winnerLabel && fixture.homeScore === fixture.awayScore && (
          <span className="block text-gray-300">Awans: {displayTeamName(winnerLabel)}</span>
        )}
      </span>
    );
  }

  return (
    <span className="block">
      <span className="block text-sm font-bold">
        {hasStarted ? 'Wynik w oczekiwaniu' : 'Wynik niedostępny'}
      </span>
      <span className="block text-gray-200">
        {hasStarted
          ? 'Mecz już się rozpoczął, ale wynik nie jest jeszcze zapisany.'
          : 'Wynik pojawi się po zakończeniu i zatwierdzeniu meczu.'}
      </span>
    </span>
  );
}

function pluralizePeople(count: number) {
  if (count === 1) return 'osoba';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return 'osoby';
  }
  return 'osób';
}

export function Fixtures() {
  const { isPlayer, playerId, credential } = useSync();
  const fixtures = useLiveQuery(() => db.fixtures.toArray(), []);
  const allBets = useLiveQuery(() => db.bets.toArray(), []);
  const allHiddenBets = useLiveQuery(() => db.hiddenBets.toArray(), []);
  const allOdds = useLiveQuery(() => db.odds.toArray(), []);
  const allMatchOdds = useLiveQuery(() => db.matchOdds.toArray(), []);
  const allScores = useLiveQuery(() => db.scores.toArray(), []);
  const players = useLiveQuery(() => db.players.toArray(), []);
  const leaderboard = useLiveQuery(() => getLeaderboardData(), []);

  const [filter, setFilter] = useState<'all' | 'upcoming' | 'locked'>('all');
  const [group, setGroup] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hideOtherBetsPreference, setHideOtherBetsPreference] = useState<{
    key: string | null;
    value: boolean;
  }>({ key: null, value: false });
  const fixtureRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const now = useCurrentTime();
  const sortedPlayers = [...(players ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pl-PL'));
  const leaderIds = leaderIdsFromRows(leaderboard?.board);
  const hidePreferenceKey = isPlayer
    ? hideOtherBetsStorageKey(credential?.leagueId, playerId)
    : null;
  const hideOtherBetsLocally = hideOtherBetsPreference.key === hidePreferenceKey
    ? hideOtherBetsPreference.value
    : readHideOtherBetsPreference(hidePreferenceKey);

  function updateHideOtherBetsLocally(value: boolean) {
    setHideOtherBetsPreference({ key: hidePreferenceKey, value });
    if (!hidePreferenceKey) return;
    if (value) {
      localStorage.setItem(hidePreferenceKey, '1');
    } else {
      localStorage.removeItem(hidePreferenceKey);
    }
  }

  // Build per-fixture lookup sets
  const betByPlayerFixture = new Map<string, Bet>();
  const hiddenBetByPlayerFixture = new Map<string, { playerId: string; fixtureId: string }>();
  const betPlayerIdsByFixture = new Map<string, Set<string>>();
  function registerBetPresence(fixtureId: string, registeredPlayerId: string) {
    const playerIds = betPlayerIdsByFixture.get(fixtureId) ?? new Set<string>();
    playerIds.add(registeredPlayerId);
    betPlayerIdsByFixture.set(fixtureId, playerIds);
  }
  for (const b of (allBets ?? [])) {
    betByPlayerFixture.set(`${b.playerId}:${b.fixtureId}`, b);
    registerBetPresence(b.fixtureId, b.playerId);
  }
  for (const hiddenBet of (allHiddenBets ?? [])) {
    hiddenBetByPlayerFixture.set(`${hiddenBet.playerId}:${hiddenBet.fixtureId}`, hiddenBet);
    registerBetPresence(hiddenBet.fixtureId, hiddenBet.playerId);
  }
  const betCountMap = new Map(
    [...betPlayerIdsByFixture.entries()].map(([fixtureId, playerIds]) => [fixtureId, playerIds.size]),
  );
  const currentPlayerBetFixtureIds = new Set(
    playerId
      ? [
          ...(allBets ?? []),
          ...(allHiddenBets ?? []),
        ]
          .filter((bet) => bet.playerId === playerId)
          .map((bet) => bet.fixtureId)
      : [],
  );
  const hitCountMap = new Map<string, number>();
  for (const score of (allScores ?? [])) {
    hitCountMap.set(score.fixtureId, (hitCountMap.get(score.fixtureId) ?? 0) + 1);
  }
  const totalPlayers = (players ?? []).length;
  const fixturesWithFetchedOdds = new Set<string>();
  const exactOddByBetKey = new Map<string, number>();
  for (const odd of (allOdds ?? [])) {
    if (odd.provider || odd.fetchedAt) {
      fixturesWithFetchedOdds.add(odd.fixtureId);
    }
    if (odd.odd > 0) {
      exactOddByBetKey.set(betOddsKey(odd), odd.odd);
    }
  }
  for (const matchOdd of (allMatchOdds ?? [])) {
    if (matchOdd.fetchedAt) {
      fixturesWithFetchedOdds.add(matchOdd.fixtureId);
    }
  }

  const next24Fixtures = (fixtures ?? [])
    .filter((fixture) => {
      const kickoff = fixtureKickoffMs(fixture);
      return fixture.status !== 'locked' && kickoff > now && kickoff <= now + NEXT_24H_MS;
    })
    .sort(compareFixturesByKickoff);
  const ongoingFixtures = (fixtures ?? [])
    .filter((fixture) => isFixtureOngoing(fixture, now))
    .sort(compareFixturesByKickoff);
  const nextUpcomingFixture = (fixtures ?? [])
    .filter((fixture) => fixture.status !== 'locked' && !hasFixtureStarted(fixture, now))
    .sort(compareFixturesByKickoff)[0] ?? null;
  const nextFixture = ongoingFixtures.at(-1) ?? nextUpcomingFixture;
  const nextFixtureOngoing = nextFixture ? isFixtureOngoing(nextFixture, now) : false;

  const filtered = (fixtures ?? [])
    .filter((f) => {
      if (filter !== 'all' && f.status !== filter) return false;
      if (group !== 'all') {
        const label = f.group ?? f.round;
        if (label !== group) return false;
      }
      return true;
    })
    .sort(compareFixturesByKickoff);

  // Group fixtures by Warsaw local date.
  const byDate: Record<string, typeof filtered> = {};
  for (const f of filtered) {
    const key = fixtureWarsawDateKey(f);
    (byDate[key] = byDate[key] ?? []).push(f);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function openFixture(id: string) {
    setFilter('all');
    setGroup('all');
    setExpandedId(id);
  }

  function renderQuickBetPreview(fixture: Fixture) {
    const fixtureId = fixture.id;
    if (isPlayer && playerId) {
      const currentPlayerBet = betByPlayerFixture.get(`${playerId}:${fixtureId}`);
      const currentPlayerHiddenBet = hiddenBetByPlayerFixture.get(`${playerId}:${fixtureId}`);
      return currentPlayerBet ? (
        <span className="inline-flex flex-col items-end rounded bg-green-50 px-2 py-1 text-xs text-green-700 sm:flex-row sm:items-center sm:gap-1">
          <span className="font-semibold">Twój typ {betScore(currentPlayerBet)}</span>
          <span className="text-[10px] font-medium text-green-600">
            {oddLabel(exactOddByBetKey.get(betOddsKey(currentPlayerBet)))}
          </span>
        </span>
      ) : currentPlayerHiddenBet ? (
        <span className="inline-flex items-center rounded bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
          Twój typ zapisany
        </span>
      ) : (
        <button
          type="button"
          onClick={() => openFixture(fixtureId)}
          className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
        >
          obstaw
        </button>
      );
    }

    if (sortedPlayers.length === 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-400">
          Brak graczy
        </span>
      );
    }

    return sortedPlayers.map((player) => {
      const bet = betByPlayerFixture.get(`${player.id}:${fixtureId}`);
      const hiddenBet = hiddenBetByPlayerFixture.get(`${player.id}:${fixtureId}`);
      if (!bet) {
        if (hiddenBet) {
          return (
            <span
              key={player.id}
              className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700"
            >
              <span className="max-w-28 truncate">{formatPlayerName(player, leaderIds)}</span>
              <span className="font-semibold text-gray-400">ukryty</span>
            </span>
          );
        }
        return (
          <button
            key={player.id}
            type="button"
            onClick={() => openFixture(fixtureId)}
            className="inline-flex items-center rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
          >
            <span className="max-w-28 truncate">{formatPlayerName(player, leaderIds)}</span>
        </button>
      );
      }

      const hideBetScore = shouldHideKnownBetScore({
        fixture,
        betPlayerId: bet.playerId,
        currentPlayerId: playerId,
        hideOtherBetsLocally,
        now,
      });

      return (
        <span
          key={player.id}
          className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700"
        >
          <span className="max-w-28 truncate">{formatPlayerName(player, leaderIds)}</span>
          {hideBetScore ? (
            <span className="font-semibold text-gray-400">ukryty</span>
          ) : (
            <>
              <span className="font-mono font-semibold">{betScore(bet)}</span>
              <span className="text-[10px] font-medium text-green-600">
                {oddLabel(exactOddByBetKey.get(betOddsKey(bet)))}
              </span>
            </>
          )}
        </span>
      );
    });
  }

  useEffect(() => {
    if (!expandedId) return;

    const frame = window.requestAnimationFrame(() => {
      fixtureRefs.current[expandedId]?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [expandedId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="w-full text-2xl font-bold text-gray-900 sm:w-auto sm:flex-1">Mecze</h1>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-700">Twoja strefa typera</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Szybki podgląd najbliższych typów i kursów przed zamknięciem obstawiania.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="text-xs text-gray-400">Najbliższe 24h</span>
            {isPlayer && (
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={hideOtherBetsLocally}
                  onChange={(event) => updateHideOtherBetsLocally(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
                />
                Ukryj typy innych
              </label>
            )}
          </div>
        </div>

        {next24Fixtures.length === 0 ? (
          <p className="mt-3 rounded bg-gray-50 px-3 py-3 text-center text-sm text-gray-400">
            Brak meczów w ciągu najbliższych 24 godzin.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-gray-100">
            {next24Fixtures.map((fixture) => (
              <div
                key={fixture.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 transition-colors hover:bg-gray-50 sm:px-2"
              >
                <button
                  type="button"
                  onClick={() => openFixture(fixture.id)}
                  className="min-w-0 text-left"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                    <span className="font-semibold text-gray-700">{formatFixtureTimeInWarsaw(fixture)}</span>
                    <span className="font-semibold text-gray-700">{formatFixtureDateInWarsaw(fixture, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span>{displayStageName(fixture.group ?? fixture.round)}</span>
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-gray-900">
                    {fixtureVersusLabel(fixture)}
                  </div>
                </button>
                <div className="flex min-w-0 max-w-[48vw] flex-wrap justify-end gap-1 sm:max-w-none">
                  {renderQuickBetPreview(fixture)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Najbliższy mecz</h2>
            {nextFixtureOngoing && (
              <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                W trakcie
              </span>
            )}
          </div>
          {nextFixture && (
            <button
              type="button"
              onClick={() => openFixture(nextFixture.id)}
              className="text-xs text-gray-400 transition-colors hover:text-gray-700"
            >
              Otwórz ›
            </button>
          )}
        </div>

        {!nextFixture ? (
          <p className="mt-3 rounded bg-gray-50 px-3 py-3 text-center text-sm text-gray-400">
            Brak nadchodzących meczów.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div className="min-w-0">
              <p className="text-xs text-gray-400">
                {formatFixtureDateInWarsaw(nextFixture, { weekday: 'long', day: 'numeric', month: 'long' })},
                {' '}
                {formatFixtureTimeInWarsaw(nextFixture)} Warszawa
              </p>
              <p className="mt-1 text-base font-bold leading-tight text-gray-900">
                {fixtureVersusLabel(nextFixture)}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {displayStageName(nextFixture.group ?? nextFixture.round)}
              </p>
            </div>
            <div className="min-w-0 rounded bg-gray-50 px-3 py-2">
              {sortedPlayers.length === 0 ? (
                <p className="text-sm text-gray-400">Brak graczy do pokazania.</p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {sortedPlayers.map((player) => {
                    const bet = betByPlayerFixture.get(`${player.id}:${nextFixture.id}`);
                    const hiddenBet = hiddenBetByPlayerFixture.get(`${player.id}:${nextFixture.id}`);
                    const isCurrentPlayer = player.id === playerId;
                    const betOdd = bet ? exactOddByBetKey.get(betOddsKey(bet)) : undefined;
                    const hideBetScore = bet
                      ? shouldHideKnownBetScore({
                          fixture: nextFixture,
                          betPlayerId: bet.playerId,
                          currentPlayerId: playerId,
                          hideOtherBetsLocally,
                          now,
                        })
                      : false;
                    return (
                      <div
                        key={player.id}
                        className={`flex min-w-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-sm ${
                          isCurrentPlayer ? 'bg-blue-50 text-blue-900' : 'bg-white text-gray-700'
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {formatPlayerName(player, leaderIds)}
                          {isCurrentPlayer && (
                            <span className="ml-1 text-[10px] font-semibold text-blue-600">Ty</span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={`block font-mono font-semibold leading-tight ${bet || hiddenBet ? 'text-gray-900' : 'text-gray-400'}`}>
                            {hiddenBet || hideBetScore ? 'ukryty' : bet ? betScore(bet) : '-'}
                          </span>
                          {bet && !hideBetScore && !hiddenBet && (
                            <span className="block text-[10px] font-medium leading-tight text-gray-400">
                              {oddLabel(betOdd)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="min-w-0 flex-1 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-green-500 sm:flex-none sm:min-w-48"
        >
          <option value="all">Wszystkie rundy</option>
          {ROUNDS.map((r) => (
            <option key={r} value={r}>{displayStageName(r)}</option>
          ))}
        </select>

        <div className="flex w-full gap-2 overflow-x-auto sm:w-auto sm:overflow-visible">
          {(['all', 'upcoming', 'locked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded text-sm transition-colors ${
                filter === f
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
            >
              {f === 'all' ? 'Wszystkie' : f === 'upcoming' ? 'Nadchodzące' : 'Zakończone'}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(byDate).length === 0 && (
        <p className="text-gray-400 text-center py-12">Brak meczów.</p>
      )}

      {Object.entries(byDate).map(([date, games]) => (
        <div key={date}>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">
            {formatFixtureDateInWarsaw(games[0])}
          </h2>
          <div className="space-y-1">
            {games.map((f) => {
              const isExpanded = expandedId === f.id;
              const betCount = betCountMap.get(f.id) ?? 0;
              const hitCount = hitCountMap.get(f.id) ?? 0;
              const hasFetchedOdds = fixturesWithFetchedOdds.has(f.id);
              const hasStarted = hasFixtureStarted(f, now);
              const currentPlayerHasBet = currentPlayerBetFixtureIds.has(f.id);
              const betCountColor =
                isPlayer && playerId
                  ? currentPlayerHasBet
                    ? 'text-green-500'
                    : 'text-red-500'
                  : betCount > 0
                  ? 'text-green-500'
                  : 'text-gray-300';
              return (
                <div
                  key={f.id}
                  ref={(node) => {
                    fixtureRefs.current[f.id] = node;
                  }}
                  className="scroll-mt-28 rounded-lg overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <button
                    onClick={() => toggleExpand(f.id)}
                    className="w-full bg-white px-4 py-3 text-left group sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3"
                  >
                    <div className="min-w-0 sm:flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{displayStageName(f.group ?? f.round)}</span>
                        {f.utcTime && (
                          <span className="text-xs text-gray-400">{formatFixtureTimeInWarsaw(f)} Warszawa</span>
                        )}
                      </div>
                      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
                        <span className="min-w-0 justify-self-start break-words text-gray-900 font-semibold leading-tight sm:justify-self-auto sm:break-normal">
                          {displayTeamName(f.homeTeam)}
                        </span>
                        {f.status === 'locked' ? (
                          <span className="justify-self-center text-green-600 font-bold font-mono text-sm whitespace-nowrap px-1 sm:justify-self-auto">
                            {f.homeScore}:{f.awayScore}
                          </span>
                        ) : (
                          <span className="justify-self-center text-gray-400 font-mono text-sm whitespace-nowrap px-1 sm:justify-self-auto">vs</span>
                        )}
                        <span className="min-w-0 justify-self-end break-words text-right text-gray-900 font-semibold leading-tight sm:justify-self-auto sm:break-normal sm:text-left">
                          {displayTeamName(f.awayTeam)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 sm:mb-0.5 sm:mt-0 sm:shrink-0 sm:justify-end sm:self-end">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Tooltip
                          focusable={false}
                          content={
                            <span className="block">
                              <span className="block text-sm font-bold">Zakłady</span>
                              <span className="block text-gray-200">
                                Obstawiło: {betCount}/{totalPlayers}.
                              </span>
                              <span className="block text-gray-400">
                                Gracze w lidze: {totalPlayers} {pluralizePeople(totalPlayers)}.
                              </span>
                              {isPlayer && playerId && (
                                <span className="mt-1 block text-gray-300">
                                  {currentPlayerHasBet ? 'Twój zakład jest zapisany.' : 'Brak Twojego zakładu.'}
                                </span>
                              )}
                            </span>
                          }
                        >
                          <span className={`flex items-center gap-0.5 text-xs ${betCountColor}`}>
                            👤
                            {totalPlayers > 0 && (
                              <span className="font-mono">{betCount}/{totalPlayers}</span>
                            )}
                          </span>
                        </Tooltip>
                        {f.status === 'locked' && totalPlayers > 0 && (
                          <Tooltip
                            focusable={false}
                            content={
                              <span className="block">
                                <span className="block text-sm font-bold">Trafienia</span>
                                <span className="block text-gray-200">
                                  Trafiło: {hitCount}/{totalPlayers}.
                                </span>
                                <span className="block text-gray-400">
                                  Gracze w lidze: {totalPlayers} {pluralizePeople(totalPlayers)}.
                                </span>
                              </span>
                            }
                          >
                            <span className="flex items-center gap-0.5 text-xs">
                              🎯
                              <span className="font-mono">{hitCount}/{totalPlayers}</span>
                            </span>
                          </Tooltip>
                        )}
                        {hasFetchedOdds && (
                          <Tooltip
                            focusable={false}
                            content={
                              <span className="block">
                                <span className="block text-sm font-bold">Kursy</span>
                                <span className="block text-gray-200">Kursy zostały pobrane przez hosta.</span>
                              </span>
                            }
                          >
                            <span className="text-blue-500">📊</span>
                          </Tooltip>
                        )}
                        <Tooltip focusable={false} content={resultStatusTooltip(f, hasStarted)}>
                          {statusBadge(f.status, hasStarted)}
                        </Tooltip>
                      </div>
                      <span className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4">
                      <FixturePanel
                        id={f.id}
                        leaderIds={leaderIds}
                        hideOtherBetsLocally={hideOtherBetsLocally}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
