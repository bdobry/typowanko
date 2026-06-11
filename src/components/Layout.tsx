import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '🏆 Leaderboard', end: true },
  { to: '/fixtures', label: '⚽ Fixtures' },
  { to: '/players', label: '👥 Players' },
  { to: '/settings', label: '⚙️ Settings' },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-bold text-green-400 text-lg tracking-tight">Typowanko 🇺🇸🇨🇦🇲🇽</span>
          <nav className="flex gap-1 ml-auto">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-green-700 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
      <footer className="text-center text-xs text-gray-600 py-3">
        WC 2026 · All data stored locally in your browser
      </footer>
    </div>
  );
}
