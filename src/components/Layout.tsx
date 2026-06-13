import { NavLink, Outlet } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useSync } from '../sync/syncContextValue';

const navItems = [
  { to: '/fixtures', label: '⚽ Mecze' },
  { to: '/leaderboard', label: '🏆 Tabela' },
  { to: '/players', label: '👥 Gracze' },
  { to: '/settings', label: '⚙️ Opcje' },
];

export function Layout() {
  const { role, playerId, pending, syncing, error, revision } = useSync();
  const currentPlayer = useLiveQuery(
    () => playerId ? db.players.get(playerId) : undefined,
    [playerId],
  );
  const accountLabel =
    role === 'player'
      ? currentPlayer?.name ?? 'Gracz'
      : role === 'viewer'
      ? 'Gość'
      : 'Host';
  const roleLabel =
    role === 'host' ? `${accountLabel} · rev ${revision ?? '-'}` : accountLabel;
  const syncLabel = error ? 'Błąd sync' : syncing ? 'Sync…' : pending ? 'Do wysłania' : roleLabel;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
          <span className="shrink-0 font-bold text-green-600 text-lg tracking-tight">Typowanko</span>
          <span
            className={`hidden sm:inline-flex text-[11px] rounded-full px-2 py-1 border ${
              error
                ? 'bg-red-50 text-red-600 border-red-200'
                : role === 'viewer' || role === 'player'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : pending
                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                : 'bg-gray-50 text-gray-500 border-gray-200'
            }`}
            title={error ?? undefined}
          >
            {syncLabel}
          </span>
          <nav className="flex w-full gap-1 overflow-x-auto sm:ml-auto sm:w-auto sm:overflow-visible">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `shrink-0 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-green-700 text-white'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-gray-400 py-3">
        MŚ 2026 · {role === 'viewer' || role === 'player' ? 'tryb podglądu' : 'dane lokalne z opcjonalnym sync'} · build {__APP_BUILD__}
      </footer>
    </div>
  );
}
