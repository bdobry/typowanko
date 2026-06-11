import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { nanoid } from '../utils/nanoid';

export function Players() {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray(), []);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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
              <span className="flex-1 text-gray-900">{p.name}</span>
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
