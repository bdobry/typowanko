import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Bet, type Fixture, type FixtureWinner, type Odd } from '../db';
import { Tooltip } from './Tooltip';
import { recalcFixture } from '../utils/scoring';
import { fetchAllOdds, getApiFootballKey } from '../utils/oddsApi';
import { fetchMatchResult } from '../utils/footballDataApi';
import { useSync } from '../sync/syncContextValue';
import { displayTeamName, toStoredTeamName } from '../utils/displayNames';
import { hasFixtureStarted } from '../utils/fixtureTime';
import { formatPlayerName } from '../utils/playerNames';
import { syncKnockoutFixtures } from '../db/seed';
import {
  areFixtureBetsPublic,
  hideOtherBetsStorageKey,
  readHideOtherBetsPreference,
  shouldHideKnownBetScore,
} from '../utils/betVisibility';

const SCORES = Array.from({ length: 6 }, (_, i) => i); // 0..5
const EMPTY_LEADER_IDS = new Set<string>();

function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function ScoreSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-900 font-mono focus:outline-none focus:border-green-500"
    >
      {SCORES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function PlayerBetForm({
  fixture,
  currentBet,
}: {
  fixture: Fixture;
  currentBet?: Bet;
}) {
  const { submitPlayerBet, syncing } = useSync();
  const [homeScore, setHomeScore] = useState(currentBet?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(currentBet?.awayScore ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function saveOwnBet(e: React.FormEvent) {
    e.preventDefault();
    if (hasFixtureStarted(fixture)) {
      setError('Mecz już się rozpoczął. Zakładów nie można już zmieniać.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await submitPlayerBet(fixture.id, homeScore, awayScore);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={saveOwnBet}
      className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 space-y-3"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-blue-900 flex-1">
          Twój zakład
        </span>
        <span className="text-sm text-blue-800">{displayTeamName(fixture.homeTeam)}</span>
        <ScoreSelect value={homeScore} onChange={setHomeScore} />
        <span className="text-blue-400">:</span>
        <ScoreSelect value={awayScore} onChange={setAwayScore} />
        <span className="text-sm text-blue-800">{displayTeamName(fixture.awayTeam)}</span>
        <button
          type="submit"
          disabled={saving || syncing}
          className="ml-auto bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm transition-colors"
        >
          {saving || syncing ? 'Zapisywanie…' : currentBet ? 'Zmień zakład' : 'Zapisz zakład'}
        </button>
      </div>
      {saved && (
        <p className="text-xs text-blue-700">Zapisano zakład.</p>
      )}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </form>
  );
}

export function FixturePanel({
  id,
  leaderIds = EMPTY_LEADER_IDS,
  hideOtherBetsLocally,
}: {
  id: string;
  leaderIds?: ReadonlySet<string>;
  hideOtherBetsLocally?: boolean;
}) {
  const {
    role,
    isViewer,
    isPlayer,
    playerId,
    credential,
    syncing,
    markDirty,
    submitHostBet,
    deleteHostBet,
    setFixtureBetVisibility,
  } = useSync();
  const fixture = useLiveQuery(() => db.fixtures.get(id), [id]);
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), []);
  const bets = useLiveQuery(() => db.bets.where('fixtureId').equals(id).toArray(), [id]);
  const hiddenBets = useLiveQuery(() => db.hiddenBets.where('fixtureId').equals(id).toArray(), [id]);
  const odds = useLiveQuery(() => db.odds.where('fixtureId').equals(id).toArray(), [id]);
  const scores = useLiveQuery(() => db.scores.where('fixtureId').equals(id).toArray(), [id]);
  const matchOdd = useLiveQuery(() => db.matchOdds.where('fixtureId').equals(id).first(), [id]);

  const [resultH, setResultH] = useState(0);
  const [resultA, setResultA] = useState(0);
  const [resultWinner, setResultWinner] = useState<FixtureWinner | null>(null);

  const [betH, setBetH] = useState(0);
  const [betA, setBetA] = useState(0);
  const [betPlayerId, setBetPlayerId] = useState('');
  const [betFormError, setBetFormError] = useState<string | null>(null);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);

  const [showOdds, setShowOdds] = useState(false);
  const [oddsInputs, setOddsInputs] = useState<Record<string, string>>({});

  const [editTeams, setEditTeams] = useState(false);
  const [editHome, setEditHome] = useState('');
  const [editAway, setEditAway] = useState('');

  const [fetchingOdds, setFetchingOdds] = useState(false);
  const [fetchOddsError, setFetchOddsError] = useState<string | null>(null);
  const [fetchOddsSuccess, setFetchOddsSuccess] = useState<string | null>(null);

  const [fetchingResult, setFetchingResult] = useState(false);
  const [fetchResultError, setFetchResultError] = useState<string | null>(null);
  const now = useCurrentTime();

  const hidePreferenceKey = isPlayer
    ? hideOtherBetsStorageKey(credential?.leagueId, playerId)
    : null;

  const currentPlayerBet = playerId
    ? (bets ?? []).find((bet) => bet.playerId === playerId)
    : undefined;

  if (!fixture) return <div className="text-gray-400 text-center py-8">Ładowanie…</div>;

  const effectiveHideOtherBets = hideOtherBetsLocally ?? readHideOtherBetsPreference(hidePreferenceKey);
  const fixtureBetsPublic = areFixtureBetsPublic(fixture, now);
  const oddsMap = new Map<string, number>(
    (odds ?? []).map((o) => [`${o.homeScore}:${o.awayScore}`, o.odd])
  );
  const betsMap = new Map((bets ?? []).map((b) => [b.playerId, b]));
  const hiddenBetsMap = new Map((hiddenBets ?? []).map((hiddenBet) => [hiddenBet.playerId, hiddenBet]));
  const scoresMap = new Map((scores ?? []).map((s) => [s.playerId, s]));
  const playerNameById = new Map((players ?? []).map((p) => [p.id, formatPlayerName(p, leaderIds)]));
  const betScoreMap = new Map<string, { names: string[]; hasCurrentPlayer: boolean }>();
  for (const bet of bets ?? []) {
    if (
      shouldHideKnownBetScore({
        fixture,
        betPlayerId: bet.playerId,
        currentPlayerId: playerId,
        hideOtherBetsLocally: effectiveHideOtherBets,
        now,
      })
    ) {
      continue;
    }
    const key = `${bet.homeScore}:${bet.awayScore}`;
    const entry = betScoreMap.get(key) ?? { names: [], hasCurrentPlayer: false };
    const name = playerNameById.get(bet.playerId) ?? 'Gracz';
    entry.names.push(bet.playerId === playerId ? `${name} (Ty)` : name);
    entry.hasCurrentPlayer = entry.hasCurrentPlayer || bet.playerId === playerId;
    betScoreMap.set(key, entry);
  }

  async function saveBet(e: React.FormEvent) {
    e.preventDefault();
    if (isViewer) return;
    if (!betPlayerId) return;
    if (hasFixtureStarted(fixture!)) {
      setBetFormError('Mecz już się rozpoczął. Zakładów nie można już zmieniać.');
      return;
    }
    setBetFormError(null);
    try {
      if (role === 'host') {
        await submitHostBet(fixture!.id, betPlayerId, betH, betA);
      } else {
        const existing = await db.bets
          .where('[playerId+fixtureId]')
          .equals([betPlayerId, fixture!.id])
          .first();
        const updatedAt = Date.now();
        if (existing) {
          await db.bets.update(existing.id!, {
            homeScore: betH,
            awayScore: betA,
            updatedAt,
            updatedBy: 'host',
          });
        } else {
          await db.bets.add({
            playerId: betPlayerId,
            fixtureId: fixture!.id,
            homeScore: betH,
            awayScore: betA,
            updatedAt,
            updatedBy: 'host',
          });
        }
        await db.hiddenBets.where('[playerId+fixtureId]').equals([betPlayerId, fixture!.id]).delete();
        markDirty();
      }
      setBetPlayerId('');
    } catch (err) {
      setBetFormError(err instanceof Error ? err.message : String(err));
    }
  }

  async function lockFixture() {
    if (isViewer) return;
    const needsWinner = fixture!.num != null && resultH === resultA;
    if (needsWinner && resultWinner == null) {
      alert('Wybierz drużynę awansującą po dogrywce/karnych.');
      return;
    }
    if (!confirm(`Zablokować wynik ${resultH}:${resultA} dla ${displayTeamName(fixture!.homeTeam)} vs ${displayTeamName(fixture!.awayTeam)}?`)) return;
    await db.fixtures.update(fixture!.id, {
      status: 'locked',
      homeScore: resultH,
      awayScore: resultA,
      winnerTeam: needsWinner ? resultWinner ?? undefined : undefined,
    });
    await recalcFixture({
      ...fixture!,
      status: 'locked',
      homeScore: resultH,
      awayScore: resultA,
      winnerTeam: needsWinner ? resultWinner ?? undefined : undefined,
    });
    await syncKnockoutFixtures();
    markDirty();
  }

  async function unlockFixture() {
    if (isViewer) return;
    if (!confirm('Odblokować mecz? Punkty zostaną usunięte.')) return;
    await db.fixtures.update(fixture!.id, {
      status: 'upcoming',
      homeScore: undefined,
      awayScore: undefined,
      winnerTeam: undefined,
    });
    await db.scores.where('fixtureId').equals(fixture!.id).delete();
    await syncKnockoutFixtures();
    markDirty();
  }

  async function updateBetVisibility(hideBetsUntilKickoff: boolean) {
    if (isViewer) return;
    setVisibilityError(null);
    try {
      if (role === 'host') {
        await setFixtureBetVisibility(fixture!.id, hideBetsUntilKickoff);
      } else {
        await db.fixtures.update(fixture!.id, { hideBetsUntilKickoff });
        markDirty();
      }
    } catch (err) {
      setVisibilityError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveOdds() {
    if (isViewer) return;
    const toSave: Omit<Odd, 'id'>[] = [];
    for (const [key, val] of Object.entries(oddsInputs)) {
      const odd = parseFloat(val);
      if (isNaN(odd) || odd <= 0) continue;
      const [h, a] = key.split(':').map(Number);
      toSave.push({
        fixtureId: fixture!.id,
        homeScore: h,
        awayScore: a,
        odd,
        manuallyEdited: true, // Mark as manually edited
      });
    }
    await db.transaction('rw', db.odds, async () => {
      for (const o of toSave) {
        const existing = await db.odds
          .where('[fixtureId+homeScore+awayScore]')
          .equals([o.fixtureId, o.homeScore, o.awayScore])
          .first();
        if (existing) {
          await db.odds.update(existing.id!, { odd: o.odd, manuallyEdited: true });
        } else {
          await db.odds.add(o);
        }
      }
    });
    markDirty();
    setOddsInputs({});
    setShowOdds(false);
  }

  async function saveTeams() {
    if (isViewer) return;
    await db.fixtures.update(fixture!.id, {
      homeTeam: toStoredTeamName(editHome) || fixture!.homeTeam,
      awayTeam: toStoredTeamName(editAway) || fixture!.awayTeam,
    });
    markDirty();
    setEditTeams(false);
  }

  function initOddsInputs() {
    const map: Record<string, string> = {};
    for (const h of SCORES) {
      for (const a of SCORES) {
        const key = `${h}:${a}`;
        map[key] = oddsMap.has(key) ? String(oddsMap.get(key)) : '';
      }
    }
    setOddsInputs(map);
    setShowOdds(true);
  }

  async function fetchOddsFromApi() {
    if (isViewer) return;
    const apiKey = getApiFootballKey();
    if (!apiKey) {
      setFetchOddsError('Brak klucza API. Ustaw go w ⚙️ Settings.');
      return;
    }
    setFetchingOdds(true);
    setFetchOddsError(null);
    setFetchOddsSuccess(null);
    try {
      const { correctScoreOdds, match1X2 } = await fetchAllOdds(
        fixture!.homeTeam,
        fixture!.awayTeam,
        fixture!.date,
        apiKey,
      );
      
      let updatedCount = 0;
      let skippedCount = 0;
      
      await db.transaction('rw', db.odds, db.matchOdds, async () => {
        for (const { homeScore, awayScore, odd, bookmakerId, bookmakerName, market, fetchedAt } of correctScoreOdds) {
          const existing = await db.odds
            .where('[fixtureId+homeScore+awayScore]')
            .equals([fixture!.id, homeScore, awayScore])
            .first();
          
          // Do not overwrite manually edited or locked odds
          if (existing && (existing.manuallyEdited || existing.locked)) {
            skippedCount++;
            continue;
          }
          
          if (existing) {
            await db.odds.update(existing.id!, {
              odd,
              provider: 'api-football',
              bookmakerId,
              bookmakerName,
              market,
              fetchedAt,
            });
            updatedCount++;
          } else {
            await db.odds.add({
              fixtureId: fixture!.id,
              homeScore,
              awayScore,
              odd,
              provider: 'api-football',
              bookmakerId,
              bookmakerName,
              market,
              fetchedAt,
              manuallyEdited: false,
              locked: false,
            });
            updatedCount++;
          }
        }

        if (match1X2) {
          const existingMatchOdd = await db.matchOdds.where('fixtureId').equals(fixture!.id).first();
          if (existingMatchOdd && (existingMatchOdd.manuallyEdited || existingMatchOdd.locked)) {
            skippedCount++;
          } else if (existingMatchOdd) {
            await db.matchOdds.update(existingMatchOdd.id!, {
              homeOdd: match1X2.homeOdd,
              drawOdd: match1X2.drawOdd,
              awayOdd: match1X2.awayOdd,
              bookmakerId: match1X2.bookmakerId,
              bookmakerName: match1X2.bookmakerName,
              fetchedAt: match1X2.fetchedAt,
            });
          } else {
            await db.matchOdds.add({
              fixtureId: fixture!.id,
              homeOdd: match1X2.homeOdd,
              drawOdd: match1X2.drawOdd,
              awayOdd: match1X2.awayOdd,
              bookmakerId: match1X2.bookmakerId,
              bookmakerName: match1X2.bookmakerName,
              fetchedAt: match1X2.fetchedAt,
            });
          }
        }
      });
      
      let message = `Pobrano ${updatedCount} kursów z Bet365.`;
      if (match1X2) {
        message += ` Kurs 1X2: 1=${match1X2.homeOdd} X=${match1X2.drawOdd} 2=${match1X2.awayOdd}.`;
      }
      if (skippedCount > 0) {
        message += ` Pominięto ${skippedCount} ręcznie edytowanych/zablokowanych kursów.`;
      }
      markDirty();
      setFetchOddsSuccess(message);
      setTimeout(() => setFetchOddsSuccess(null), 5000);
    } catch (err) {
      setFetchOddsError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingOdds(false);
    }
  }

  async function fetchResultFromApi() {
    const apiKey = getApiFootballKey();
    if (!apiKey) {
      setFetchResultError('Brak klucza API api-football.com. Ustaw go w ⚙️ Settings.');
      return;
    }
    setFetchingResult(true);
    setFetchResultError(null);
    try {
      const result = await fetchMatchResult(
        fixture!.homeTeam,
        fixture!.awayTeam,
        fixture!.date,
        apiKey,
      );
      setResultH(result.homeScore);
      setResultA(result.awayScore);
      setResultWinner(result.winnerTeam ?? null);
    } catch (err) {
      setFetchResultError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingResult(false);
    }
  }

  const isLocked = fixture.status === 'locked';
  const hasStarted = hasFixtureStarted(fixture, now);
  const betsClosed = isLocked || hasStarted;
  const canHostManageBetVisibility = (role === 'host' || role === 'local-host') && !fixtureBetsPublic;
  const needsKnockoutWinner = fixture.num != null && resultH === resultA;
  const resultOutcome =
    isLocked && fixture.homeScore != null && fixture.awayScore != null
      ? fixture.homeScore > fixture.awayScore
        ? 'home'
        : fixture.homeScore < fixture.awayScore
        ? 'away'
        : 'draw'
      : null;

  function matchOddBoxClass(outcome: 'home' | 'draw' | 'away') {
    return `rounded border px-3 py-1.5 text-center ${
      resultOutcome === outcome
        ? 'bg-green-100 border-green-200 ring-1 ring-green-200'
        : 'bg-gray-50 border-gray-200'
    }`;
  }

  function matchOddLabelClass(outcome: 'home' | 'draw' | 'away') {
    return `block text-xs ${resultOutcome === outcome ? 'text-green-700' : 'text-gray-400'}`;
  }

  function matchOddValueClass(outcome: 'home' | 'draw' | 'away') {
    return `font-bold ${resultOutcome === outcome ? 'text-green-800' : 'text-gray-700'}`;
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Lock / Unlock */}
      {!isLocked && !isViewer && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-500">Ustaw wynik i zablokuj</h2>
            <button
              type="button"
              onClick={() => {
                setEditHome(displayTeamName(fixture.homeTeam));
                setEditAway(displayTeamName(fixture.awayTeam));
                setEditTeams((value) => !value);
              }}
              className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors"
            >
              {editTeams ? 'Ukryj edycję drużyn' : 'Edytuj drużyny'}
            </button>
          </div>

          {editTeams && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveTeams();
              }}
              className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                <input
                  value={editHome}
                  onChange={(e) => setEditHome(e.target.value)}
                  placeholder={displayTeamName(fixture.homeTeam)}
                  className="min-w-0 bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-900 focus:outline-none focus:border-green-500 text-sm"
                />
                <span className="hidden text-gray-400 sm:inline">vs</span>
                <input
                  value={editAway}
                  onChange={(e) => setEditAway(e.target.value)}
                  placeholder={displayTeamName(fixture.awayTeam)}
                  className="min-w-0 bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-900 focus:outline-none focus:border-green-500 text-sm"
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditTeams(false)}
                  className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded transition-colors"
                >
                  Zapisz drużyny
                </button>
              </div>
            </form>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-700 w-24 truncate text-right">{displayTeamName(fixture.homeTeam)}</span>
            <ScoreSelect value={resultH} onChange={setResultH} />
            <span className="text-gray-400">:</span>
            <ScoreSelect value={resultA} onChange={setResultA} />
            <span className="text-sm text-gray-700 w-24 truncate">{displayTeamName(fixture.awayTeam)}</span>
            <button
              onClick={fetchResultFromApi}
              disabled={fetchingResult}
              className="text-xs bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-blue-700 px-3 py-1.5 rounded transition-colors"
              title="Pobierz wynik z api-football.com"
            >
              {fetchingResult ? '⏳ Pobieranie…' : '🔄 Pobierz wynik'}
            </button>
            <button
              onClick={lockFixture}
              className="ml-auto bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded font-medium text-sm transition-colors"
            >
              Zatwierdź wynik
            </button>
          </div>
          {needsKnockoutWinner && (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Awans po dogrywce/karnych
              </span>
              <select
                value={resultWinner ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setResultWinner(value === 'home' || value === 'away' ? value : null);
                }}
                className="bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-green-500"
              >
                <option value="">Wybierz drużynę…</option>
                <option value="home">{displayTeamName(fixture.homeTeam)}</option>
                <option value="away">{displayTeamName(fixture.awayTeam)}</option>
              </select>
            </label>
          )}
          {fetchResultError && (
            <p className="text-xs text-red-500 mt-2 bg-red-50 border border-red-200 rounded px-3 py-2">
              ⚠️ {fetchResultError}
            </p>
          )}
          {!oddsMap.has(`${resultH}:${resultA}`) && (
            <p className="text-xs text-yellow-600 mt-2">
              ⚠️ Brak kursu dla {resultH}:{resultA} — trafione dokładne zakłady dadzą 0 punktów.
              {matchOdd && ' Kursy 1X2 (remis/wygrana/przegrana) są dostępne i zostaną użyte dla zakładów z trafnym typem.'}
            </p>
          )}
        </div>
      )}

      {isLocked && !isViewer && (
        <div className="flex justify-end">
          <button
            onClick={unlockFixture}
            className="text-xs text-red-500 hover:text-red-400 px-3 py-1.5 rounded border border-red-200 hover:border-red-400 transition-colors"
          >
            Odblokuj mecz
          </button>
        </div>
      )}

      {/* Bets */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-500">Zakłady graczy</h2>
          {canHostManageBetVisibility && (
            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={fixture.hideBetsUntilKickoff === true}
                disabled={syncing}
                onChange={(event) => {
                  void updateBetVisibility(event.target.checked);
                }}
                className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
              />
              Ukryj wyniki typów do startu
            </label>
          )}
        </div>

        {visibilityError && (
          <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {visibilityError}
          </p>
        )}

        {isPlayer && !betsClosed && playerId && (
          <PlayerBetForm
            key={`${fixture.id}:${currentPlayerBet?.homeScore ?? 'x'}:${currentPlayerBet?.awayScore ?? 'x'}`}
            fixture={fixture}
            currentBet={currentPlayerBet}
          />
        )}

        {isPlayer && betsClosed && (
          <p className="mb-4 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
            {isLocked
              ? 'Mecz jest zablokowany. Zakładów nie można już zmieniać.'
              : 'Mecz już się rozpoczął. Zakładów nie można już zmieniać.'}
          </p>
        )}

        {!betsClosed && !isViewer && (players?.length ?? 0) > 0 && (
          <form onSubmit={saveBet} className="flex items-center gap-2 mb-4 flex-wrap">
            <select
              value={betPlayerId}
              onChange={(e) => setBetPlayerId(e.target.value)}
              className="bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-green-500 flex-1"
            >
              <option value="">Wybierz gracza…</option>
              {players?.map((p) => (
                <option key={p.id} value={p.id}>{formatPlayerName(p, leaderIds)}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">{displayTeamName(fixture.homeTeam)}</span>
            <ScoreSelect value={betH} onChange={setBetH} />
            <span className="text-gray-400">:</span>
            <ScoreSelect value={betA} onChange={setBetA} />
            <span className="text-sm text-gray-500">{displayTeamName(fixture.awayTeam)}</span>
            <button
              type="submit"
              disabled={syncing}
              className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
            >
              {syncing ? 'Zapisywanie…' : 'Zapisz zakład'}
            </button>
          </form>
        )}

        {betFormError && (
          <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {betFormError}
          </p>
        )}

        {hasStarted && !isLocked && !isViewer && (
          <p className="mb-4 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
            Mecz już się rozpoczął. Dodawanie, zmiana i usuwanie zakładów są zablokowane.
          </p>
        )}

        {(players?.length ?? 0) === 0 && (
          <p className="text-gray-400 text-sm">Najpierw dodaj graczy.</p>
        )}

        {(players?.length ?? 0) > 0 && (
          <div className="space-y-1">
            {players?.map((p) => {
              const bet = betsMap.get(p.id);
              const hiddenBet = hiddenBetsMap.get(p.id);
              const score = scoresMap.get(p.id);
              const betOdd = bet ? oddsMap.get(`${bet.homeScore}:${bet.awayScore}`) : undefined;
              const knownBetScoreHidden = bet
                ? shouldHideKnownBetScore({
                    fixture,
                    betPlayerId: bet.playerId,
                    currentPlayerId: playerId,
                    hideOtherBetsLocally: effectiveHideOtherBets,
                    now,
                  })
                : false;
              const displayedOdd = score || knownBetScoreHidden ? undefined : betOdd;
              const scoreType = score?.pointType === 'outcome' ? 'outcome' : score ? 'exact' : null;
              const hasAnyBet = bet != null || hiddenBet != null;
              const resultHidden = hiddenBet != null || knownBetScoreHidden;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                    scoreType === 'exact'
                      ? 'bg-green-50 border border-green-200'
                      : scoreType === 'outcome'
                      ? 'bg-yellow-50 border border-yellow-200'
                      : p.id === playerId
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-gray-50'
                  }`}
                >
                  <span className="flex-1 text-gray-900">
                    {formatPlayerName(p, leaderIds)}
                    {p.id === playerId && (
                      <span className="text-[10px] text-blue-600 bg-blue-100 rounded-full px-2 py-0.5 ml-2">
                        Ty
                      </span>
                    )}
                  </span>
                  {bet ? (
                    <span className="inline-flex items-center gap-2">
                      {resultHidden ? (
                        <span className="text-xs font-semibold text-gray-400">wynik ukryty</span>
                      ) : (
                        <span className="font-mono text-gray-700">
                          {bet.homeScore}:{bet.awayScore}
                        </span>
                      )}
                      {displayedOdd != null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            score ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          kurs {displayedOdd.toFixed(2)}
                          {score?.pointType === 'outcome' && ' 1X2'}
                        </span>
                      )}
                    </span>
                  ) : hiddenBet ? (
                    <span className="text-xs font-semibold text-gray-400">wynik ukryty</span>
                  ) : (
                    <span className="text-gray-400 italic text-xs">brak zakładu</span>
                  )}
                  {score && (
                    <span
                      className={`font-bold ${
                        scoreType === 'outcome' ? 'text-yellow-700' : 'text-green-600'
                      }`}
                    >
                      +{score.points.toFixed(2)} pkt{' '}
                      <span
                        className={`font-normal text-xs ${
                          scoreType === 'outcome' ? 'text-yellow-600' : 'text-green-500'
                        }`}
                      >
                        ({scoreType === 'outcome' ? '1x2' : 'wynik'})
                      </span>
                    </span>
                  )}
                  {isLocked && bet && !score && (
                    <span className="text-gray-400 text-xs">chybił</span>
                  )}
                  {!betsClosed && !isViewer && hasAnyBet && (
                    <button
                      onClick={async () => {
                        try {
                          setBetFormError(null);
                          if (role === 'host') {
                            await deleteHostBet(fixture.id, p.id);
                          } else {
                            await db.bets.where('[playerId+fixtureId]').equals([p.id, fixture.id]).delete();
                            await db.hiddenBets.where('[playerId+fixtureId]').equals([p.id, fixture.id]).delete();
                            markDirty();
                          }
                        } catch (err) {
                          setBetFormError(err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className="text-gray-400 hover:text-red-500 text-xs transition-colors"
                      title="Usuń zakład"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Odds */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500">Tabela kursów</h2>
          {!isViewer && (
            <div className="flex items-center gap-2">
              <button
                onClick={fetchOddsFromApi}
                disabled={fetchingOdds}
                className="text-xs bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-blue-700 px-3 py-1.5 rounded transition-colors"
                title="Pobierz kursy z The Odds API"
              >
                {fetchingOdds ? '⏳ Pobieranie…' : '🔄 Pobierz kursy'}
              </button>
              <button
                onClick={showOdds ? () => setShowOdds(false) : initOddsInputs}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded transition-colors"
              >
                {showOdds ? 'Anuluj' : oddsMap.size > 0 ? 'Edytuj kursy' : 'Wprowadź kursy'}
              </button>
            </div>
          )}
        </div>

        {fetchOddsError && (
          <p className="text-xs text-red-500 mb-3 bg-red-50 border border-red-200 rounded px-3 py-2">
            ⚠️ {fetchOddsError}
          </p>
        )}
        {fetchOddsSuccess && (
          <p className="text-xs text-green-600 mb-3 bg-green-50 border border-green-200 rounded px-3 py-2">
            ✓ {fetchOddsSuccess}
          </p>
        )}

        {showOdds && !isViewer ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Wprowadź kursy dziesiętne dla każdego wyniku (0–5). Zostaw puste, aby pominąć.</p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    <th className="text-gray-400 text-left pb-1 pr-2">Wyjazd ↓ / Gospodarz →</th>
                    {SCORES.map((h) => (
                      <th key={h} className="text-gray-500 font-mono pb-1 px-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCORES.map((a) => (
                    <tr key={a}>
                      <td className="text-gray-500 font-mono pr-2 py-0.5">{a}</td>
                      {SCORES.map((h) => {
                        const key = `${h}:${a}`;
                        return (
                          <td key={h} className="px-1 py-0.5">
                            <input
                              type="number"
                              step="0.01"
                              min="1"
                              value={oddsInputs[key] ?? ''}
                              onChange={(e) =>
                                setOddsInputs((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              className="w-14 bg-gray-50 border border-gray-300 rounded px-1 py-0.5 text-gray-900 font-mono text-xs focus:outline-none focus:border-green-500"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={saveOdds}
              className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Zapisz kursy
            </button>
          </div>
        ) : oddsMap.size > 0 ? (
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="text-gray-400 text-left pb-1 pr-2">Wyjazd ↓ / Gospodarz →</th>
                  {SCORES.map((h) => (
                    <th key={h} className="text-gray-500 font-mono pb-1 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCORES.map((a) => (
                  <tr key={a}>
                    <td className="text-gray-500 font-mono pr-2 py-0.5">{a}</td>
                    {SCORES.map((h) => {
                      const key = `${h}:${a}`;
                      const odd = oddsMap.get(key);
                      const isResult = isLocked && fixture.homeScore === h && fixture.awayScore === a;
                      const betEntry = betScoreMap.get(key);
                      const isBet = betEntry != null && betEntry.names.length > 0;
                      const isCurrentPlayerBet = betEntry?.hasCurrentPlayer ?? false;
                      const cell = (
                        <span
                          className={`inline-flex w-14 justify-center rounded px-1.5 py-0.5 font-mono ${
                            isResult
                              ? 'bg-green-100 text-green-700 font-bold'
                              : isCurrentPlayerBet
                              ? 'bg-gray-300 text-gray-900 font-bold ring-1 ring-gray-400'
                              : isBet
                              ? 'bg-gray-50 text-gray-500 font-semibold ring-1 ring-gray-100'
                              : odd
                              ? 'text-gray-700'
                              : 'text-gray-300'
                          }`}
                        >
                          {odd ? odd.toFixed(2) : '–'}
                        </span>
                      );
                      return (
                        <td
                          key={h}
                          className="px-1 py-0.5 text-center"
                        >
                          {isBet || isResult ? (
                            <Tooltip
                              content={
                                <span className="block">
                                  <span className="block text-sm font-bold">
                                    Wynik {h}:{a}
                                  </span>
                                  <span className="block text-gray-200">
                                    {odd ? `Kurs ${odd.toFixed(2)}` : 'Brak kursu'}
                                  </span>
                                  {isBet && (
                                    <span className="mt-1 block text-gray-300">
                                      Obstawione przez: {betEntry.names.join(', ')}
                                    </span>
                                  )}
                                  {isResult && (
                                    <span className="mt-1 block text-green-200">To jest wynik meczu.</span>
                                  )}
                                </span>
                              }
                            >
                              {cell}
                            </Tooltip>
                          ) : (
                            cell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Brak kursów.</p>
        )}

        {matchOdd && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Kurs 1X2 (typ wyniku)</p>
            <div className="flex gap-3 text-xs font-mono">
              <span className={matchOddBoxClass('home')}>
                <span className={matchOddLabelClass('home')}>1 (gosp.)</span>
                <span className={matchOddValueClass('home')}>{matchOdd.homeOdd.toFixed(2)}</span>
              </span>
              <span className={matchOddBoxClass('draw')}>
                <span className={matchOddLabelClass('draw')}>X (remis)</span>
                <span className={matchOddValueClass('draw')}>{matchOdd.drawOdd.toFixed(2)}</span>
              </span>
              <span className={matchOddBoxClass('away')}>
                <span className={matchOddLabelClass('away')}>2 (gość)</span>
                <span className={matchOddValueClass('away')}>{matchOdd.awayOdd.toFixed(2)}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
