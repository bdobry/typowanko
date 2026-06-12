import { useState } from 'react';
import { useSync } from './syncContextValue';

export function AccessGate() {
  const { loginWithId, startLocalHost, syncing, error, apiBase } = useSync();
  const [accessId, setAccessId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submitAccessId(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      await loginWithId(accessId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  async function startHost() {
    setLocalError(null);
    try {
      await startLocalHost();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">
            Typowanko
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Dołącz do ligi</h1>
          <p className="text-sm text-gray-500 mt-2">
            Wklej Host ID, Viewer ID albo Player ID udostępniony przez gospodarza. Gospodarz może też
            rozpocząć lokalnie i włączyć synchronizację później w ustawieniach.
          </p>
        </div>

        {!apiBase && (
          <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
            Synchronizacja wymaga konfiguracji <code>VITE_SYNC_API_BASE</code>. Tryb lokalny
            działa bez Workera.
          </p>
        )}

        <form onSubmit={submitAccessId} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Host ID / Viewer ID / Player ID</label>
            <input
              value={accessId}
              onChange={(e) => setAccessId(e.target.value)}
              placeholder="TYP-V-ABC123-DEFG456H"
              className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm font-mono focus:outline-none focus:border-green-500"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={syncing || !accessId.trim()}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            {syncing ? 'Łączenie…' : 'Wejdź z ID'}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-xs text-gray-400">albo</span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>

        <button
          type="button"
          onClick={startHost}
          className="w-full border border-gray-300 hover:border-green-500 text-gray-700 hover:text-green-700 px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          Rozpocznij jako gospodarz lokalnie
        </button>

        {(localError || error) && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {localError || error}
          </p>
        )}
      </div>
    </div>
  );
}
