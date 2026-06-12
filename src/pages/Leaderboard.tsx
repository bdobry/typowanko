import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../utils/scoring';
import { db } from '../db';
import { useSync } from '../sync/syncContextValue';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard() {
  const { isViewer } = useSync();
  const board = useLiveQuery(() => getLeaderboard(), []);
  const lockedCount = useLiveQuery(() => db.fixtures.where('status').equals('locked').count(), []);
  const totalFixtures = useLiveQuery(() => db.fixtures.count(), []);
  const upcomingFixtures = useLiveQuery(
    () => db.fixtures.where('status').equals('upcoming').sortBy('date'),
    [],
  );

  if (!board) return <div className="text-gray-400 text-center py-12">Ładowanie…</div>;

  const nextFive = (upcomingFixtures ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tabela</h1>
        <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-3 py-1">
          ⚽ {lockedCount ?? 0} / {totalFixtures ?? 0} meczów
        </span>
      </div>

      {board.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p>{isViewer ? 'Brak graczy w tej lidze.' : 'Brak graczy. Dodaj ich w zakładce Gracze!'}</p>
        </div>
      )}

      {board.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-green-700 text-white text-xs uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left w-8">#</th>
                <th className="px-4 py-2.5 text-left">Gracz</th>
                <th className="px-4 py-2.5 text-center">Trafione</th>
                <th className="px-4 py-2.5 text-right">Punkty</th>
              </tr>
            </thead>
            <tbody>
              {board.map(({ player, total, history }, idx) => (
                <tr
                  key={player.id}
                  className={`border-t border-gray-100 transition-colors ${
                    idx === 0
                      ? 'bg-yellow-50'
                      : idx % 2 === 0
                      ? 'bg-white'
                      : 'bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-3 font-bold text-center">
                    {idx < 3 ? (
                      <span className="text-base">{MEDALS[idx]}</span>
                    ) : (
                      <span className="text-gray-400">{idx + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{player.name}</td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {history.length}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-600 text-base">
                    {total.toFixed(2)}
                    <span className="text-xs font-normal text-gray-400 ml-1">pkt</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upcoming fixtures mini-preview */}
      {nextFive.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Nadchodzące mecze</h2>
            <Link to="/fixtures" className="text-xs text-green-600 hover:text-green-800 transition-colors">
              Wszystkie →
            </Link>
          </div>
          <div className="space-y-1.5">
            {nextFive.map((f) => (
              <Link
                key={f.id}
                to="/fixtures"
                className="flex items-center gap-3 bg-white border border-gray-200 hover:border-green-400 rounded-lg px-4 py-2.5 transition-colors group"
              >
                <span className="text-xs text-gray-400 w-24 shrink-0">
                  {new Date(f.date + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                  {f.utcTime ? ` ${f.utcTime}` : ''}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                  {f.homeTeam} <span className="text-gray-400 font-normal">vs</span> {f.awayTeam}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{f.group ?? f.round}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Best scores */}
      {board.length > 0 && board.flatMap(({ history }) => history).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Najlepsze trafienia</h2>
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
                  className="text-sm bg-white rounded-lg px-4 py-2.5 flex gap-3 items-center border border-gray-200"
                >
                  <span className="text-gray-400 text-xs w-5 text-center">{i + 1}.</span>
                  <span className="text-gray-700 truncate flex-1">{h.playerName}</span>
                  <span className="text-gray-500 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                    {h.resultHomeScore}:{h.resultAwayScore}
                  </span>
                  <span className="text-green-600 font-bold">+{h.points.toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
