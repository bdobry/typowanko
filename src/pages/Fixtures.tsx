import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db';

const ROUNDS = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
  'Round of 32','Round of 16','Quarter-final','Semi-final','Third place','Final',
];

function statusBadge(status: string) {
  return status === 'locked' ? (
    <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">✓ Locked</span>
  ) : (
    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">Upcoming</span>
  );
}

export function Fixtures() {
  const fixtures = useLiveQuery(() => db.fixtures.orderBy('date').toArray(), []);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'locked'>('all');
  const [group, setGroup] = useState<string>('all');

  const filtered = (fixtures ?? []).filter((f) => {
    if (filter !== 'all' && f.status !== filter) return false;
    if (group !== 'all') {
      // match by group label or round
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-white flex-1">Fixtures</h1>

        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-green-500"
        >
          <option value="all">All rounds</option>
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
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : 'Locked'}
          </button>
        ))}
      </div>

      {Object.keys(byDate).length === 0 && (
        <p className="text-gray-500 text-center py-12">No fixtures found.</p>
      )}

      {Object.entries(byDate).map(([date, games]) => (
        <div key={date}>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">
            {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </h2>
          <div className="space-y-1">
            {games.map((f) => (
              <Link
                key={f.id}
                to={`/fixtures/${f.id}`}
                className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-lg px-4 py-3 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">{f.group ?? f.round}</span>
                    {f.utcTime && (
                      <span className="text-xs text-gray-600">{f.utcTime} UTC</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-white font-medium">{f.homeTeam}</span>
                    {f.status === 'locked' ? (
                      <span className="text-green-400 font-bold font-mono text-sm px-2">
                        {f.homeScore}:{f.awayScore}
                      </span>
                    ) : (
                      <span className="text-gray-600 font-mono text-sm px-2">vs</span>
                    )}
                    <span className="text-white font-medium">{f.awayTeam}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(f.status)}
                  <span className="text-gray-600 group-hover:text-gray-400 transition-colors">›</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
