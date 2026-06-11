import { useParams, useNavigate } from 'react-router-dom';
import { FixturePanel } from '../components/FixturePanel';

export function FixtureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/fixtures')} className="text-gray-400 hover:text-gray-700 text-sm transition-colors">
        ← Powrót do meczów
      </button>
      <FixturePanel id={id!} />
    </div>
  );
}
