import { useState } from 'react';
import { ODDS_API_KEY_STORAGE_KEY } from '../utils/oddsApi';

export function Settings() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(ODDS_API_KEY_STORAGE_KEY) ?? '',
  );
  const [saved, setSaved] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem(ODDS_API_KEY_STORAGE_KEY, apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function clear() {
    localStorage.removeItem(ODDS_API_KEY_STORAGE_KEY);
    setApiKey('');
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-white">Settings</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-1">The Odds API — klucz API</h2>
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

        <form onSubmit={save} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
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
            {saved ? '✓ Zapisano' : 'Zapisz'}
          </button>
          {apiKey && (
            <button
              type="button"
              onClick={clear}
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
          <p>📈 Rynek: <code className="text-gray-400">correct_score</code> (regiony: eu, uk) — pobierany per mecz</p>
        </div>
      </div>
    </div>
  );
}
