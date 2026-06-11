import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Odd } from '../db';
import { recalcFixture } from '../utils/scoring';
import { fetchCorrectScoreOdds, ODDS_API_KEY_STORAGE_KEY } from '../utils/oddsApi';
import { fetchMatchResult, getFootballDataApiKey } from '../utils/footballDataApi';

const SCORES = Array.from({ length: 6 }, (_, i) => i); // 0..5

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
      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white font-mono focus:outline-none focus:border-green-500"
    >
      {SCORES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

export function FixtureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const fixture = useLiveQuery(() => db.fixtures.get(id!), [id]);
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), []);
  const bets = useLiveQuery(() => db.bets.where('fixtureId').equals(id!).toArray(), [id]);
  const odds = useLiveQuery(() => db.odds.where('fixtureId').equals(id!).toArray(), [id]);
  const scores = useLiveQuery(() => db.scores.where('fixtureId').equals(id!).toArray(), [id]);

  // Result entry state
  const [resultH, setResultH] = useState(0);
  const [resultA, setResultA] = useState(0);

  // Bet entry
  const [betH, setBetH] = useState(0);
  const [betA, setBetA] = useState(0);
  const [betPlayerId, setBetPlayerId] = useState('');

  // Odds entry
  const [showOdds, setShowOdds] = useState(false);
  const [oddsInputs, setOddsInputs] = useState<Record<string, string>>({});

  // Fixture edit (teams for knockout)
  const [editTeams, setEditTeams] = useState(false);
  const [editHome, setEditHome] = useState('');
  const [editAway, setEditAway] = useState('');

  // Odds API fetch state
  const [fetchingOdds, setFetchingOdds] = useState(false);
  const [fetchOddsError, setFetchOddsError] = useState<string | null>(null);
  const [fetchOddsSuccess, setFetchOddsSuccess] = useState<string | null>(null);

  // Result fetch state
  const [fetchingResult, setFetchingResult] = useState(false);
  const [fetchResultError, setFetchResultError] = useState<string | null>(null);

  if (!fixture) return <div className="text-gray-500 text-center py-12">Loading…</div>;

  const oddsMap = new Map<string, number>(
    (odds ?? []).map((o) => [`${o.homeScore}:${o.awayScore}`, o.odd])
  );

  const betsMap = new Map((bets ?? []).map((b) => [b.playerId, b]));
  const scoresMap = new Map((scores ?? []).map((s) => [s.playerId, s]));

  async function saveBet(e: React.FormEvent) {
    e.preventDefault();
    if (!betPlayerId) return;
    const existing = await db.bets
      .where('[playerId+fixtureId]')
      .equals([betPlayerId, fixture!.id])
      .first();
    if (existing) {
      await db.bets.update(existing.id!, { homeScore: betH, awayScore: betA });
    } else {
      await db.bets.add({ playerId: betPlayerId, fixtureId: fixture!.id, homeScore: betH, awayScore: betA });
    }
    setBetPlayerId('');
  }

  async function lockFixture() {
    if (!confirm(`Lock result ${resultH}:${resultA} for ${fixture!.homeTeam} vs ${fixture!.awayTeam}?`)) return;
    await db.fixtures.update(fixture!.id, {
      status: 'locked',
      homeScore: resultH,
      awayScore: resultA,
    });
    await recalcFixture({ ...fixture!, status: 'locked', homeScore: resultH, awayScore: resultA });
  }

  async function unlockFixture() {
    if (!confirm('Unlock this match? Points will be removed.')) return;
    await db.fixtures.update(fixture!.id, { status: 'upcoming', homeScore: undefined, awayScore: undefined });
    await db.scores.where('fixtureId').equals(fixture!.id).delete();
  }

  async function saveOdds() {
    const toSave: Omit<Odd, 'id'>[] = [];
    for (const [key, val] of Object.entries(oddsInputs)) {
      const odd = parseFloat(val);
      if (isNaN(odd) || odd <= 0) continue;
      const [h, a] = key.split(':').map(Number);
      toSave.push({ fixtureId: fixture!.id, homeScore: h, awayScore: a, odd });
    }
    // Upsert
    await db.transaction('rw', db.odds, async () => {
      for (const o of toSave) {
        const existing = await db.odds
          .where('[fixtureId+homeScore+awayScore]')
          .equals([o.fixtureId, o.homeScore, o.awayScore])
          .first();
        if (existing) {
          await db.odds.update(existing.id!, { odd: o.odd });
        } else {
          await db.odds.add(o);
        }
      }
    });
    setOddsInputs({});
    setShowOdds(false);
  }

  async function saveTeams() {
    await db.fixtures.update(fixture!.id, {
      homeTeam: editHome.trim() || fixture!.homeTeam,
      awayTeam: editAway.trim() || fixture!.awayTeam,
    });
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
    const apiKey = localStorage.getItem(ODDS_API_KEY_STORAGE_KEY)?.trim();
    if (!apiKey) {
      setFetchOddsError('Brak klucza API. Ustaw go w ⚙️ Settings.');
      return;
    }
    setFetchingOdds(true);
    setFetchOddsError(null);
    setFetchOddsSuccess(null);
    try {
      const results = await fetchCorrectScoreOdds(
        fixture!.homeTeam,
        fixture!.awayTeam,
        fixture!.date,
        apiKey,
      );
      await db.transaction('rw', db.odds, async () => {
        for (const { homeScore, awayScore, odd } of results) {
          const existing = await db.odds
            .where('[fixtureId+homeScore+awayScore]')
            .equals([fixture!.id, homeScore, awayScore])
            .first();
          if (existing) {
            await db.odds.update(existing.id!, { odd });
          } else {
            await db.odds.add({ fixtureId: fixture!.id, homeScore, awayScore, odd });
          }
        }
      });
      setFetchOddsSuccess(`Pobrano ${results.length} kursów.`);
      setTimeout(() => setFetchOddsSuccess(null), 4000);
    } catch (err) {
      setFetchOddsError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingOdds(false);
    }
  }

  async function fetchResultFromApi() {
    const apiKey = getFootballDataApiKey();
    if (!apiKey) {
      setFetchResultError('Brak klucza API football-data.org. Ustaw go w ⚙️ Settings.');
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
    } catch (err) {
      setFetchResultError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchingResult(false);
    }
  }

  const isLocked = fixture.status === 'locked';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/fixtures')} className="text-gray-500 hover:text-gray-300 text-sm mb-3 transition-colors">
          ← Back to fixtures
        </button>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">{fixture.group ?? fixture.round}</span>
            {isLocked ? (
              <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">✓ Locked</span>
            ) : (
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">Upcoming</span>
            )}
          </div>

          {/* Teams */}
          {editTeams ? (
            <div className="flex items-center gap-2 mt-2">
              <input
                value={editHome}
                onChange={(e) => setEditHome(e.target.value)}
                placeholder={fixture.homeTeam}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white focus:outline-none text-sm"
              />
              <span className="text-gray-500">vs</span>
              <input
                value={editAway}
                onChange={(e) => setEditAway(e.target.value)}
                placeholder={fixture.awayTeam}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white focus:outline-none text-sm"
              />
              <button onClick={saveTeams} className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded transition-colors">Save</button>
              <button onClick={() => setEditTeams(false)} className="text-gray-500 hover:text-white text-xs px-2 py-1.5 rounded transition-colors">×</button>
            </div>
          ) : (
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xl font-bold text-white flex-1">{fixture.homeTeam}</span>
              {isLocked ? (
                <span className="text-3xl font-bold text-green-400 font-mono">
                  {fixture.homeScore}:{fixture.awayScore}
                </span>
              ) : (
                <span className="text-gray-500 font-mono text-xl">vs</span>
              )}
              <span className="text-xl font-bold text-white flex-1 text-right">{fixture.awayTeam}</span>
              {!isLocked && (
                <button
                  onClick={() => { setEditHome(fixture.homeTeam); setEditAway(fixture.awayTeam); setEditTeams(true); }}
                  className="text-gray-600 hover:text-gray-400 text-xs ml-2 transition-colors"
                  title="Edit teams (knockout stage)"
                >
                  ✏️
                </button>
              )}
            </div>
          )}

          <div className="text-xs text-gray-500 mt-2">
            {new Date(fixture.date + 'T12:00:00').toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
            {fixture.utcTime && ` · ${fixture.utcTime} UTC`}
            {fixture.venue && ` · ${fixture.venue}`}
          </div>
        </div>
      </div>

      {/* Lock / Unlock */}
      {!isLocked && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Set Result & Lock</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-300 w-24 truncate text-right">{fixture.homeTeam}</span>
            <ScoreSelect value={resultH} onChange={setResultH} />
            <span className="text-gray-500">:</span>
            <ScoreSelect value={resultA} onChange={setResultA} />
            <span className="text-sm text-gray-300 w-24 truncate">{fixture.awayTeam}</span>
            <button
              onClick={fetchResultFromApi}
              disabled={fetchingResult}
              className="text-xs bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-blue-200 px-3 py-1.5 rounded transition-colors"
              title="Pobierz wynik z football-data.org"
            >
              {fetchingResult ? '⏳ Pobieranie…' : '🔄 Pobierz wynik'}
            </button>
            <button
              onClick={lockFixture}
              className="ml-auto bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded font-medium text-sm transition-colors"
            >
              Lock Result
            </button>
          </div>
          {fetchResultError && (
            <p className="text-xs text-red-400 mt-2 bg-red-950 border border-red-900 rounded px-3 py-2">
              ⚠️ {fetchResultError}
            </p>
          )}
          {!oddsMap.has(`${resultH}:${resultA}`) && (
            <p className="text-xs text-yellow-600 mt-2">⚠️ No odds set for {resultH}:{resultA} — points will be 0 for correct bets.</p>
          )}
        </div>
      )}

      {isLocked && (
        <div className="flex justify-end">
          <button
            onClick={unlockFixture}
            className="text-xs text-red-500 hover:text-red-400 px-3 py-1.5 rounded border border-red-900 hover:border-red-700 transition-colors"
          >
            Unlock match
          </button>
        </div>
      )}

      {/* Bets */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">
          Player Bets
        </h2>

        {!isLocked && (players?.length ?? 0) > 0 && (
          <form onSubmit={saveBet} className="flex items-center gap-2 mb-4 flex-wrap">
            <select
              value={betPlayerId}
              onChange={(e) => setBetPlayerId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-green-500 flex-1"
            >
              <option value="">Select player…</option>
              {players?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="text-sm text-gray-400">{fixture.homeTeam}</span>
            <ScoreSelect value={betH} onChange={setBetH} />
            <span className="text-gray-500">:</span>
            <ScoreSelect value={betA} onChange={setBetA} />
            <span className="text-sm text-gray-400">{fixture.awayTeam}</span>
            <button
              type="submit"
              className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
            >
              Save Bet
            </button>
          </form>
        )}

        {(players?.length ?? 0) === 0 && (
          <p className="text-gray-600 text-sm">Add players first.</p>
        )}

        {(players?.length ?? 0) > 0 && (
          <div className="space-y-1">
            {players?.map((p) => {
              const bet = betsMap.get(p.id);
              const score = scoresMap.get(p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                    score ? 'bg-green-950 border border-green-900' : 'bg-gray-800'
                  }`}
                >
                  <span className="flex-1 text-white">{p.name}</span>
                  {bet ? (
                    <span className="font-mono text-gray-300">
                      {bet.homeScore}:{bet.awayScore}
                    </span>
                  ) : (
                    <span className="text-gray-600 italic text-xs">no bet</span>
                  )}
                  {score && (
                    <span className="text-green-400 font-bold">+{score.points.toFixed(2)} pts</span>
                  )}
                  {isLocked && bet && !score && (
                    <span className="text-gray-600 text-xs">missed</span>
                  )}
                  {!isLocked && bet && (
                    <button
                      onClick={async () => {
                        await db.bets.where('[playerId+fixtureId]').equals([p.id, fixture.id]).delete();
                      }}
                      className="text-gray-600 hover:text-red-500 text-xs transition-colors"
                      title="Remove bet"
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400">Odds Table</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchOddsFromApi}
              disabled={fetchingOdds}
              className="text-xs bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-blue-200 px-3 py-1.5 rounded transition-colors"
              title="Pobierz kursy z The Odds API"
            >
              {fetchingOdds ? '⏳ Pobieranie…' : '🔄 Pobierz kursy'}
            </button>
            <button
              onClick={showOdds ? () => setShowOdds(false) : initOddsInputs}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"
            >
              {showOdds ? 'Cancel' : oddsMap.size > 0 ? 'Edit Odds' : 'Enter Odds'}
            </button>
          </div>
        </div>

        {fetchOddsError && (
          <p className="text-xs text-red-400 mb-3 bg-red-950 border border-red-900 rounded px-3 py-2">
            ⚠️ {fetchOddsError}
          </p>
        )}
        {fetchOddsSuccess && (
          <p className="text-xs text-green-400 mb-3 bg-green-950 border border-green-900 rounded px-3 py-2">
            ✓ {fetchOddsSuccess}
          </p>
        )}

        {showOdds ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Enter decimal odds for each score (0–5). Leave blank to skip.</p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    <th className="text-gray-600 text-left pb-1 pr-2">Away ↓ / Home →</th>
                    {SCORES.map((h) => (
                      <th key={h} className="text-gray-400 font-mono pb-1 px-1">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SCORES.map((a) => (
                    <tr key={a}>
                      <td className="text-gray-400 font-mono pr-2 py-0.5">{a}</td>
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
                              className="w-14 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-white font-mono text-xs focus:outline-none focus:border-green-500"
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
              Save Odds
            </button>
          </div>
        ) : oddsMap.size > 0 ? (
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th className="text-gray-600 text-left pb-1 pr-2">Away ↓ / Home →</th>
                  {SCORES.map((h) => (
                    <th key={h} className="text-gray-400 font-mono pb-1 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCORES.map((a) => (
                  <tr key={a}>
                    <td className="text-gray-400 font-mono pr-2 py-0.5">{a}</td>
                    {SCORES.map((h) => {
                      const key = `${h}:${a}`;
                      const odd = oddsMap.get(key);
                      const isResult = isLocked && fixture.homeScore === h && fixture.awayScore === a;
                      return (
                        <td
                          key={h}
                          className={`px-2 py-0.5 font-mono text-center rounded ${
                            isResult ? 'bg-green-900 text-green-300 font-bold' : odd ? 'text-gray-300' : 'text-gray-700'
                          }`}
                        >
                          {odd ? odd.toFixed(2) : '–'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-600 text-sm">No odds set yet.</p>
        )}
      </div>
    </div>
  );
}
