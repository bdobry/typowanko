import { useState } from 'react';
import {
  ODDS_API_KEY_STORAGE_KEY,
  CORRECT_SCORE_BET_ID_KEY,
  DEFAULT_BOOKMAKER_ID_KEY,
  DEFAULT_BOOKMAKER_NAME,
  getCachedConfigIds,
  resolveCorrectScoreBetId,
  resolveBet365BookmakerId,
  getApiFootballKey,
} from '../utils/oddsApi';

const ENV_API_FOOTBALL_KEY = (import.meta.env.VITE_API_FOOTBALL_KEY as string | undefined) ?? '';

export function Settings() {
  const [oddsApiKey, setOddsApiKey] = useState(
    () => localStorage.getItem(ODDS_API_KEY_STORAGE_KEY) ?? '',
  );
  const [oddsSaved, setOddsSaved] = useState(false);
  const [configStatus, setConfigStatus] = useState<{
    betId: number | null;
    bookmakerId: number | null;
  }>(() => {
    const cached = getCachedConfigIds();
    return {
      betId: cached?.betId ?? null,
      bookmakerId: cached?.bookmakerId ?? null,
    };
  });
  const [resolvingConfig, setResolvingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  function saveOddsKey(e: React.FormEvent) {
    e.preventDefault();
    if (oddsApiKey.trim()) {
      localStorage.setItem(ODDS_API_KEY_STORAGE_KEY, oddsApiKey.trim());
    } else {
      localStorage.removeItem(ODDS_API_KEY_STORAGE_KEY);
    }
    setOddsSaved(true);
    setTimeout(() => setOddsSaved(false), 2000);
  }

  function clearOddsKey() {
    localStorage.removeItem(ODDS_API_KEY_STORAGE_KEY);
    setOddsApiKey('');
  }

  function clearConfig() {
    localStorage.removeItem(CORRECT_SCORE_BET_ID_KEY);
    localStorage.removeItem(DEFAULT_BOOKMAKER_ID_KEY);
    setConfigStatus({ betId: null, bookmakerId: null });
    setConfigError(null);
  }

  async function resolveConfig() {
    const apiKey = getApiFootballKey();
    if (!apiKey) {
      setConfigError('Brak klucza API. Ustaw go najpierw.');
      return;
    }
    setResolvingConfig(true);
    setConfigError(null);
    try {
      const betId = await resolveCorrectScoreBetId(apiKey);
      const bookmakerId = await resolveBet365BookmakerId(apiKey);
      setConfigStatus({ betId, bookmakerId });
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      setResolvingConfig(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900">Ustawienia</h1>

      {/* api-football.com */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">api-football.com — wyniki i kursy bukmacherskie</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Używany do automatycznego pobierania wyników zakończonych meczów oraz kursów na
            dokładny wynik (Exact Score) dla meczów MŚ 2026. Plan Pro — bez limitu CORS i
            zapytań.
          </p>
          {ENV_API_FOOTBALL_KEY && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Klucz domyślny skonfigurowany przez administratora. Możesz go nadpisać poniżej.
            </p>
          )}
          {!ENV_API_FOOTBALL_KEY && (
            <p className="text-xs text-gray-500 mt-1">
              Brak klucza domyślnego.{' '}
              <a
                href="https://dashboard.api-football.com/register"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-500 underline"
              >
                Zarejestruj się na api-football.com
              </a>{' '}
              żeby otrzymać klucz.
            </p>
          )}
        </div>

        <form onSubmit={saveOddsKey} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">
              API Key{ENV_API_FOOTBALL_KEY && !oddsApiKey ? ' (używany: domyślny)' : ''}
            </label>
            <input
              type="text"
              value={oddsApiKey}
              onChange={(e) => { setOddsApiKey(e.target.value); setOddsSaved(false); }}
              placeholder={ENV_API_FOOTBALL_KEY ? '(nadpisz klucz domyślny)' : 'np. a1b2c3d4e5f6...'}
              className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm font-mono focus:outline-none focus:border-green-500"
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
              className="text-gray-400 hover:text-red-500 px-3 py-2 rounded text-sm transition-colors"
              title="Usuń klucz"
            >
              ×
            </button>
          )}
        </form>

        <div className="border-t border-gray-200 pt-3 space-y-1 text-xs text-gray-500">
          <p>📍 Klucz lokalny jest przechowywany tylko w Twojej przeglądarce.</p>
          <p>🏆 Liga: <code className="text-gray-600">1</code> (FIFA World Cup), sezon <code className="text-gray-600">2026</code></p>
          <p>📡 Wyniki: <code className="text-gray-600">GET /fixtures?date=&league=1&season=2026</code></p>
          <p>📡 Kursy: <code className="text-gray-600">GET /odds?fixture=&lt;id&gt;&bet=&lt;betId&gt;&bookmaker=&lt;bookmakerId&gt;</code></p>
          <p>📈 Rynek: <code className="text-gray-600">Correct Score</code>, bukmacher: <code className="text-gray-600">{DEFAULT_BOOKMAKER_NAME}</code></p>
        </div>

        {/* Configuration Status */}
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Konfiguracja API</h3>
            <p className="text-xs text-gray-500 mb-3">
              Aplikacja wymaga rozwiązania identyfikatorów rynku "Correct Score" oraz bukmachera "{DEFAULT_BOOKMAKER_NAME}".
              Zostaną one automatycznie pobrane przy pierwszym pobieraniu kursów lub możesz je rozwiązać teraz.
            </p>
          </div>

          <div className="bg-gray-50 rounded p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Correct Score bet ID:</span>
              {configStatus.betId ? (
                <span className="font-mono text-green-600">✓ {configStatus.betId}</span>
              ) : (
                <span className="text-gray-400 italic">nie rozwiązano</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">{DEFAULT_BOOKMAKER_NAME} bookmaker ID:</span>
              {configStatus.bookmakerId ? (
                <span className="font-mono text-green-600">✓ {configStatus.bookmakerId}</span>
              ) : (
                <span className="text-gray-400 italic">nie rozwiązano</span>
              )}
            </div>
          </div>

          {configError && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
              ⚠️ {configError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={resolveConfig}
              disabled={resolvingConfig}
              className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              {resolvingConfig ? '⏳ Rozwiązywanie...' : '🔄 Rozwiąż konfigurację'}
            </button>
            {(configStatus.betId || configStatus.bookmakerId) && (
              <button
                onClick={clearConfig}
                className="text-gray-400 hover:text-red-500 px-3 py-2 rounded text-sm transition-colors border border-gray-300 hover:border-red-300"
              >
                Wyczyść cache
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
