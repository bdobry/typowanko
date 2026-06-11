import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/fixtures', label: '⚽ Mecze' },
  { to: '/', label: '🏆 Tabela', end: true },
  { to: '/players', label: '👥 Gracze' },
  { to: '/settings', label: '⚙️ Ustawienia' },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-bold text-green-600 text-lg tracking-tight">Typowanko 🇺🇸🇨🇦🇲🇽</span>
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
        MŚ 2026 · Wszystkie dane przechowywane lokalnie w przeglądarce
      </footer>
    </div>
  );
}
