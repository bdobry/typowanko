import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Leaderboard } from './pages/Leaderboard';
import { Players } from './pages/Players';
import { Fixtures } from './pages/Fixtures';
import { FixtureDetail } from './pages/FixtureDetail';
import { Settings } from './pages/Settings';
import { AccessGate } from './sync/AccessGate';
import { SyncProvider } from './sync/SyncContext';
import { useSync } from './sync/syncContextValue';

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/fixtures" replace /> },
      { path: 'fixtures', element: <Fixtures /> },
      { path: 'fixtures/:id', element: <FixtureDetail /> },
      { path: 'leaderboard', element: <Leaderboard /> },
      { path: 'players', element: <Players /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);

function AppShell() {
  const { ready, role } = useSync();

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Ładowanie…
      </div>
    );
  }

  if (role === 'none') {
    return <AccessGate />;
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <SyncProvider>
      <AppShell />
    </SyncProvider>
  );
}
