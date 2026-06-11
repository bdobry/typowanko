import { useEffect } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Leaderboard } from './pages/Leaderboard';
import { Players } from './pages/Players';
import { Fixtures } from './pages/Fixtures';
import { FixtureDetail } from './pages/FixtureDetail';
import { seedFixtures } from './db/seed';

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Leaderboard /> },
      { path: 'fixtures', element: <Fixtures /> },
      { path: 'fixtures/:id', element: <FixtureDetail /> },
      { path: 'players', element: <Players /> },
    ],
  },
]);

export default function App() {
  useEffect(() => {
    seedFixtures().catch(console.error);
  }, []);

  return <RouterProvider router={router} />;
}
