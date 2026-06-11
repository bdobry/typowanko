import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Player } from '../db';
import { nanoid } from '../utils/nanoid';

function PlayerHistory({ player, onClose }: { player: Player; onClose: () => void }) {
  const bets = useLiveQuery(() => db.bets.where('playerId').equals(player.id).toArray(), [player.id]);
  const fixtures = useLiveQuery(() => db.fixtures.orderBy('date').toArray(), []);
  const scores = useLiveQuery(() => db.scores.where('playerId').equals(player.id).toArray(), [player.id]);

  if (!bets || !fixtures || !scores) {
    return <div className="text-gray-400 text-sm">Ładowanie…</div>;
  }

  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
  const scoreMap = new Map(scores.map((s) => [s.fixtureId, s]));

  // Sort bets by fixture date
  const sortedBets = [...bets].sort((a, b) => {
    const fa = fixtureMap.get(a.fixtureId);
    const fb = fixtureMap.get(b.fixtureId);
    return (fa?.date ?? '').localeCompare(fb?.date ?? '');
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Historia zakładów — {player.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-4">
          {sortedBets.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Brak zakładów.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider">
                  <th className="text-left pb-2 pr-3">Mecz</th>
                  <th className="text-center pb-2 px-2">Typowanie</th>
                  <th className="text-center pb-2 px-2">Wynik</th>
                  <th className="text-right pb-2">Punkty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedBets.map((bet) => {
                  const fixture = fixtureMap.get(bet.fixtureId);
                  const score = scoreMap.get(bet.fixtureId);
                  const isLocked = fixture?.status === 'locked';
                  return (
                    <tr key={bet.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-700">
                        <div className="font-medium">{fixture?.homeTeam} – {fixture?.awayTeam}</div>
                        <div className="text-xs text-gray-400">{fixture?.date}</div>
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-gray-800">
                        {bet.homeScore}:{bet.awayScore}
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {isLocked ? (
                          <span className="text-green-600 font-semibold">
                            {fixture.homeScore}:{fixture.awayScore}
                          </span>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {score ? (
                          <span className="text-green-600 font-bold">+{score.points.toFixed(2)}</span>
                        ) : isLocked ? (
                          <span className="text-gray-400 text-xs">chybił</span>
                        ) : (
                          <span className="text-gray-300 text-xs">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function Players() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), []);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null);

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await db.players.add({ id: nanoid(), name: trimmed, createdAt: Date.now() });
    setName('');
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    await db.players.update(id, { name: trimmed });
    setEditId(null);
  }

  async function removePlayer(id: string) {
    if (!confirm('Usunąć gracza? Jego zakłady i wyniki zostaną również usunięte.')) return;
    await db.transaction('rw', db.players, db.bets, db.scores, async () => {
      await db.players.delete(id);
      await db.bets.where('playerId').equals(id).delete();
      await db.scores.where('playerId').equals(id).delete();
    });
  }

  return (
    <div className="space-y-6">
      {historyPlayer && (
        <PlayerHistory player={historyPlayer} onClose={() => setHistoryPlayer(null)} />
      )}

      <h1 className="text-2xl font-bold text-gray-900">Gracze</h1>

      <form onSubmit={addPlayer} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Imię gracza…"
          className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-green-500"
        />
        <button
          type="submit"
          className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          Dodaj
        </button>
      </form>

      {players?.length === 0 && (
        <p className="text-gray-400 text-center py-8">Brak graczy.</p>
      )}

      <ul className="space-y-2">
        {players?.map((p) =>
          editId === p.id ? (
            <li key={p.id} className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(p.id);
                  if (e.key === 'Escape') setEditId(null);
                }}
                className="flex-1 bg-white border border-green-500 rounded px-3 py-2 text-gray-900 focus:outline-none"
              />
              <button
                onClick={() => saveEdit(p.id)}
                className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded transition-colors"
              >
                Zapisz
              </button>
              <button
                onClick={() => setEditId(null)}
                className="text-gray-500 hover:text-gray-900 px-3 py-2 rounded transition-colors"
              >
                Anuluj
              </button>
            </li>
          ) : (
            <li
              key={p.id}
              className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3"
            >
              <button
                onClick={() => setHistoryPlayer(p)}
                className="flex-1 text-left text-gray-900 hover:text-green-700 transition-colors"
              >
                {p.name}
              </button>
              <button
                onClick={() => {
                  setEditId(p.id);
                  setEditName(p.name);
                }}
                className="text-gray-500 hover:text-gray-900 text-sm px-2 py-1 rounded transition-colors"
              >
                Edytuj
              </button>
              <button
                onClick={() => removePlayer(p.id)}
                className="text-red-500 hover:text-red-400 text-sm px-2 py-1 rounded transition-colors"
              >
                Usuń
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
