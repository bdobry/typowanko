import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { FixturePanel } from '../components/FixturePanel';

const ROUNDS = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
  'Round of 32','Round of 16','Quarter-final','Semi-final','Third place','Final',
];

function statusBadge(status: string) {
  return status === 'locked' ? (
    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Zakończony</span>
  ) : (
    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Nadchodzący</span>
  );
}

export function Fixtures() {
  const fixtures = useLiveQuery(() => db.fixtures.orderBy('date').toArray(), []);
  const allBets = useLiveQuery(() => db.bets.toArray(), []);
  const allOdds = useLiveQuery(() => db.odds.toArray(), []);
  const players = useLiveQuery(() => db.players.toArray(), []);

  const [filter, setFilter] = useState<'all' | 'upcoming' | 'locked'>('all');
  const [group, setGroup] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build per-fixture lookup sets
  const betCountMap = new Map<string, number>();
  for (const b of (allBets ?? [])) {
    betCountMap.set(b.fixtureId, (betCountMap.get(b.fixtureId) ?? 0) + 1);
  }
  const totalPlayers = (players ?? []).length;
  const fixturesWithOdds = new Set((allOdds ?? []).map((o) => o.fixtureId));

  const filtered = (fixtures ?? []).filter((f) => {
    if (filter !== 'all' && f.status !== filter) return false;
    if (group !== 'all') {
      const label = f.group ?? f.round;
      if (label !== group) return false;
    }
    return true;
  });

  // Group fixtures by date
  const byDate: Record<string, typeof filtered> = {};
  for (const f of filtered) {
    (byDate[f.date] = byDate[f.date] ?? []).push(f);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Mecze</h1>

        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-green-500"
        >
          <option value="all">Wszystkie rundy</option>
          {ROUNDS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {(['all', 'upcoming', 'locked'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              filter === f
                ? 'bg-green-700 text-white'
                : 'bg-gray-100 text-gray-500 hover:text-gray-900'
            }`}
          >
            {f === 'all' ? 'Wszystkie' : f === 'upcoming' ? 'Nadchodzące' : 'Zakończone'}
          </button>
        ))}
      </div>

      {Object.keys(byDate).length === 0 && (
        <p className="text-gray-400 text-center py-12">Brak meczów.</p>
      )}

      {Object.entries(byDate).map(([date, games]) => (
        <div key={date}>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">
            {new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </h2>
          <div className="space-y-1">
            {games.map((f) => {
              const isExpanded = expandedId === f.id;
              const betCount = betCountMap.get(f.id) ?? 0;
              const hasOdds = fixturesWithOdds.has(f.id);
              return (
                <div key={f.id} className="rounded-lg overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors">
                  <button
                    onClick={() => toggleExpand(f.id)}
                    className="w-full flex items-center gap-3 bg-white px-4 py-3 text-left group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{f.group ?? f.round}</span>
                        {f.utcTime && (
                          <span className="text-xs text-gray-400">{f.utcTime} UTC</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-gray-900 font-medium">{f.homeTeam}</span>
                        {f.status === 'locked' ? (
                          <span className="text-green-600 font-bold font-mono text-sm px-2">
                            {f.homeScore}:{f.awayScore}
                          </span>
                        ) : (
                          <span className="text-gray-400 font-mono text-sm px-2">vs</span>
                        )}
                        <span className="text-gray-900 font-medium">{f.awayTeam}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Status icons */}
                      <span
                        title={`Zakłady: ${betCount}/${totalPlayers}`}
                        className={`flex items-center gap-0.5 text-xs ${betCount > 0 ? 'text-green-500' : 'text-gray-300'}`}
                      >
                        🎯
                        {totalPlayers > 0 && (
                          <span className="font-mono">{betCount}/{totalPlayers}</span>
                        )}
                      </span>
                      <span
                        title={hasOdds ? 'Kursy pobrane' : 'Brak kursów'}
                        className={hasOdds ? 'text-blue-500' : 'text-gray-300'}
                      >
                        📊
                      </span>
                      {statusBadge(f.status)}
                      <span className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4">
                      <FixturePanel id={f.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
