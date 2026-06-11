import { useState } from 'react';
import { ODDS_API_KEY_STORAGE_KEY } from '../utils/oddsApi';
import { FOOTBALL_DATA_KEY_STORAGE_KEY } from '../utils/footballDataApi';

const ENV_FOOTBALL_KEY = (import.meta.env.VITE_FOOTBALL_DATA_API_KEY as string | undefined) ?? '';

export function Settings() {
  const [oddsApiKey, setOddsApiKey] = useState(
    () => localStorage.getItem(ODDS_API_KEY_STORAGE_KEY) ?? '',
  );
  const [oddsSaved, setOddsSaved] = useState(false);

  const [fdApiKey, setFdApiKey] = useState(
    () => localStorage.getItem(FOOTBALL_DATA_KEY_STORAGE_KEY) ?? '',
  );
  const [fdSaved, setFdSaved] = useState(false);

  function saveOddsKey(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem(ODDS_API_KEY_STORAGE_KEY, oddsApiKey.trim());
    setOddsSaved(true);
    setTimeout(() => setOddsSaved(false), 2000);
  }

  function clearOddsKey() {
    localStorage.removeItem(ODDS_API_KEY_STORAGE_KEY);
    setOddsApiKey('');
  }

  function saveFdKey(e: React.FormEvent) {
    e.preventDefault();
    if (fdApiKey.trim()) {
      localStorage.setItem(FOOTBALL_DATA_KEY_STORAGE_KEY, fdApiKey.trim());
    } else {
      localStorage.removeItem(FOOTBALL_DATA_KEY_STORAGE_KEY);
    }
    setFdSaved(true);
    setTimeout(() => setFdSaved(false), 2000);
  }

  function clearFdKey() {
    localStorage.removeItem(FOOTBALL_DATA_KEY_STORAGE_KEY);
    setFdApiKey('');
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-white">Settings</h1>

      {/* football-data.org */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-1">football-data.org — wyniki meczów</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Używany do automatycznego pobierania wyników zakończonych meczów MŚ 2026.
            Darmowy plan: 10 zapytań / min.{' '}
            <a
              href="https://www.football-data.org/client/register"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 underline"
            >
              Zarejestruj się na football-data.org
            </a>{' '}
            żeby otrzymać darmowy klucz.
          </p>
          {ENV_FOOTBALL_KEY && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Klucz domyślny skonfigurowany przez administratora. Możesz go nadpisać poniżej.
            </p>
          )}
        </div>

        <form onSubmit={saveFdKey} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">
              API Key{ENV_FOOTBALL_KEY && !fdApiKey ? ' (używany: domyślny)' : ''}
            </label>
            <input
              type="text"
              value={fdApiKey}
              onChange={(e) => { setFdApiKey(e.target.value); setFdSaved(false); }}
              placeholder={ENV_FOOTBALL_KEY ? '(nadpisz klucz domyślny)' : 'np. a1b2c3d4e5f6...'}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-green-500"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            {fdSaved ? '✓ Zapisano' : 'Zapisz'}
          </button>
          {fdApiKey && (
            <button
              type="button"
              onClick={clearFdKey}
              className="text-gray-500 hover:text-red-400 px-3 py-2 rounded text-sm transition-colors"
              title="Usuń klucz"
            >
              ×
            </button>
          )}
        </form>

        <div className="border-t border-gray-800 pt-3 space-y-1 text-xs text-gray-500">
          <p>📍 Klucz lokalny jest przechowywany tylko w Twojej przeglądarce.</p>
          <p>🏆 Competition ID: <code className="text-gray-400">2000</code> (FIFA World Cup)</p>
          <p>📡 Endpoint: <code className="text-gray-400">GET /v4/competitions/2000/matches</code></p>
        </div>
      </div>

      {/* The Odds API */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-1">The Odds API — kursy bukmacherskie</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Używany do automatycznego pobierania kursów na dokładny wynik (correct score)
            dla meczów MŚ 2026. Darmowy plan: 500 zapytań / miesiąc.{' '}
            <a
              href="https://the-odds-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400 hover:text-green-300 underline"
            >
              Zarejestruj się na the-odds-api.com
            </a>{' '}
            żeby otrzymać klucz.
          </p>
        </div>

        <form onSubmit={saveOddsKey} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">API Key</label>
            <input
              type="text"
              value={oddsApiKey}
              onChange={(e) => { setOddsApiKey(e.target.value); setOddsSaved(false); }}
              placeholder="np. a1b2c3d4e5f6..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-green-500"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            {oddsSaved ? '✓ Zapisano' : 'Zapisz'}
          </button>
          {oddsApiKey && (
            <button
              type="button"
              onClick={clearOddsKey}
              className="text-gray-500 hover:text-red-400 px-3 py-2 rounded text-sm transition-colors"
              title="Usuń klucz"
            >
              ×
            </button>
          )}
        </form>

        <div className="border-t border-gray-800 pt-3 space-y-1 text-xs text-gray-500">
          <p>📍 Klucz jest przechowywany tylko lokalnie w Twojej przeglądarce.</p>
          <p>📊 Sport key: <code className="text-gray-400">soccer_fifa_world_cup</code></p>
          <p>📈 Rynki: <code className="text-gray-400">correct_score</code> (regiony: eu, uk)</p>
        </div>
      </div>
    </div>
  );
}
