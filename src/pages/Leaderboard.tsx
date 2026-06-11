import { useLiveQuery } from 'dexie-react-hooks';
import { getLeaderboard } from '../utils/scoring';
import { db } from '../db';

export function Leaderboard() {
  const board = useLiveQuery(() => getLeaderboard(), []);
  const lockedCount = useLiveQuery(() => db.fixtures.where('status').equals('locked').count(), []);
  const totalFixtures = useLiveQuery(() => db.fixtures.count(), []);

  if (!board) return <div className="text-gray-500 text-center py-12">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <span className="text-sm text-gray-400">
          {lockedCount ?? 0} / {totalFixtures ?? 0} matches played
        </span>
      </div>

      {board.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">👥</p>
          <p>No players yet. Add some in the Players tab!</p>
        </div>
      )}

      {board.length > 0 && (
        <div className="space-y-2">
          {board.map(({ player, total, history }, idx) => (
            <div
              key={player.id}
              className="bg-gray-900 rounded-lg px-4 py-3 flex items-center gap-4 border border-gray-800"
            >
              <span
                className={`text-lg font-bold w-8 text-center ${
                  idx === 0
                    ? 'text-yellow-400'
                    : idx === 1
                    ? 'text-gray-400'
                    : idx === 2
                    ? 'text-amber-600'
                    : 'text-gray-600'
                }`}
              >
                {idx + 1}
              </span>
              <span className="flex-1 font-medium text-white">{player.name}</span>
              <span className="text-green-400 font-bold text-lg">{total.toFixed(2)} pts</span>
              <span className="text-xs text-gray-500 w-20 text-right">
                {history.length} correct
              </span>
            </div>
          ))}
        </div>
      )}

      {board.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3 text-gray-300">Recent Wins</h2>
          <div className="space-y-1">
            {board
              .flatMap(({ player, history }) =>
                history.map((h) => ({ ...h, playerName: player.name }))
              )
              .sort((a, b) => b.points - a.points)
              .slice(0, 10)
              .map((h, i) => (
                <div
                  key={i}
                  className="text-sm bg-gray-900 rounded px-3 py-2 flex gap-3 border border-gray-800"
                >
                  <span className="text-gray-400 truncate flex-1">{h.playerName}</span>
                  <span className="text-white font-mono">
                    {h.resultHomeScore}:{h.resultAwayScore}
                  </span>
                  <span className="text-green-400 font-mono">+{h.points.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
