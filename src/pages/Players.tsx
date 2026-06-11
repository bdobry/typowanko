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
    if (!confirm('Remove player? Their bets and scores will also be deleted.')) return;
    await db.transaction('rw', db.players, db.bets, db.scores, async () => {
      await db.players.delete(id);
      await db.bets.where('playerId').equals(id).delete();
      await db.scores.where('playerId').equals(id).delete();
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Players</h1>

      <form onSubmit={addPlayer} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name…"
          className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
        />
        <button
          type="submit"
          className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          Add
        </button>
      </form>

      {players?.length === 0 && (
        <p className="text-gray-500 text-center py-8">No players yet.</p>
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
                className="flex-1 bg-gray-900 border border-green-600 rounded px-3 py-2 text-white focus:outline-none"
              />
              <button
                onClick={() => saveEdit(p.id)}
                className="bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditId(null)}
                className="text-gray-400 hover:text-white px-3 py-2 rounded transition-colors"
              >
                Cancel
              </button>
            </li>
          ) : (
            <li
              key={p.id}
              className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center gap-3"
            >
              <span className="flex-1 text-white">{p.name}</span>
              <button
                onClick={() => {
                  setEditId(p.id);
                  setEditName(p.name);
                }}
                className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => removePlayer(p.id)}
                className="text-red-500 hover:text-red-400 text-sm px-2 py-1 rounded transition-colors"
              >
                Remove
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
