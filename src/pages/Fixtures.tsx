import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { FixturePanel } from '../components/FixturePanel';
import { displayStageName, displayTeamName } from '../utils/displayNames';
import {
  compareFixturesByKickoff,
  fixtureWarsawDateKey,
  formatFixtureDateInWarsaw,
  formatFixtureTimeInWarsaw,
  hasFixtureStarted,
} from '../utils/fixtureTime';

const ROUNDS = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
  'Round of 32','Round of 16','Quarter-final','Semi-final','Third place','Final',
];

function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function statusBadge(status: string, hasStarted: boolean) {
  if (status === 'locked') {
    return (
      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Zakończony</span>
    );
  }

  if (hasStarted) {
    return (
      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Rozpoczęty</span>
    );
  }

  return (
    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Nadchodzący</span>
  );
}

export function Fixtures() {
  const fixtures = useLiveQuery(() => db.fixtures.toArray(), []);
  const allBets = useLiveQuery(() => db.bets.toArray(), []);
  const allOdds = useLiveQuery(() => db.odds.toArray(), []);
  const allMatchOdds = useLiveQuery(() => db.matchOdds.toArray(), []);
  const allScores = useLiveQuery(() => db.scores.toArray(), []);
  const players = useLiveQuery(() => db.players.toArray(), []);

  const [filter, setFilter] = useState<'all' | 'upcoming' | 'locked'>('all');
  const [group, setGroup] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fixtureRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const now = useCurrentTime();

  // Build per-fixture lookup sets
  const betCountMap = new Map<string, number>();
  for (const b of (allBets ?? [])) {
    betCountMap.set(b.fixtureId, (betCountMap.get(b.fixtureId) ?? 0) + 1);
  }
  const hitCountMap = new Map<string, number>();
  for (const score of (allScores ?? [])) {
    hitCountMap.set(score.fixtureId, (hitCountMap.get(score.fixtureId) ?? 0) + 1);
  }
  const totalPlayers = (players ?? []).length;
  const fixturesWithFetchedOdds = new Set<string>();
  for (const odd of (allOdds ?? [])) {
    if (odd.provider || odd.fetchedAt) {
      fixturesWithFetchedOdds.add(odd.fixtureId);
    }
  }
  for (const matchOdd of (allMatchOdds ?? [])) {
    if (matchOdd.fetchedAt) {
      fixturesWithFetchedOdds.add(matchOdd.fixtureId);
    }
  }

  const filtered = (fixtures ?? [])
    .filter((f) => {
      if (filter !== 'all' && f.status !== filter) return false;
      if (group !== 'all') {
        const label = f.group ?? f.round;
        if (label !== group) return false;
      }
      return true;
    })
    .sort(compareFixturesByKickoff);

  // Group fixtures by Warsaw local date.
  const byDate: Record<string, typeof filtered> = {};
  for (const f of filtered) {
    const key = fixtureWarsawDateKey(f);
    (byDate[key] = byDate[key] ?? []).push(f);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    if (!expandedId) return;

    const frame = window.requestAnimationFrame(() => {
      fixtureRefs.current[expandedId]?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [expandedId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="w-full text-2xl font-bold text-gray-900 sm:w-auto sm:flex-1">Mecze</h1>

        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="min-w-0 flex-1 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-green-500 sm:flex-none sm:min-w-48"
        >
          <option value="all">Wszystkie rundy</option>
          {ROUNDS.map((r) => (
            <option key={r} value={r}>{displayStageName(r)}</option>
          ))}
        </select>

        <div className="flex w-full gap-2 overflow-x-auto sm:w-auto sm:overflow-visible">
          {(['all', 'upcoming', 'locked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded text-sm transition-colors ${
                filter === f
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
            >
              {f === 'all' ? 'Wszystkie' : f === 'upcoming' ? 'Nadchodzące' : 'Zakończone'}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(byDate).length === 0 && (
        <p className="text-gray-400 text-center py-12">Brak meczów.</p>
      )}

      {Object.entries(byDate).map(([date, games]) => (
        <div key={date}>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">
            {formatFixtureDateInWarsaw(games[0])}
          </h2>
          <div className="space-y-1">
            {games.map((f) => {
              const isExpanded = expandedId === f.id;
              const betCount = betCountMap.get(f.id) ?? 0;
              const hitCount = hitCountMap.get(f.id) ?? 0;
              const hasFetchedOdds = fixturesWithFetchedOdds.has(f.id);
              const hasStarted = hasFixtureStarted(f, now);
              return (
                <div
                  key={f.id}
                  ref={(node) => {
                    fixtureRefs.current[f.id] = node;
                  }}
                  className="scroll-mt-28 rounded-lg overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <button
                    onClick={() => toggleExpand(f.id)}
                    className="w-full bg-white px-4 py-3 text-left group sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3"
                  >
                    <div className="min-w-0 sm:flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{displayStageName(f.group ?? f.round)}</span>
                        {f.utcTime && (
                          <span className="text-xs text-gray-400">{formatFixtureTimeInWarsaw(f)} Warszawa</span>
                        )}
                      </div>
                      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-2">
                        <span className="min-w-0 justify-self-start break-words text-gray-900 font-semibold leading-tight sm:justify-self-auto sm:break-normal">
                          {displayTeamName(f.homeTeam)}
                        </span>
                        {f.status === 'locked' ? (
                          <span className="justify-self-center text-green-600 font-bold font-mono text-sm whitespace-nowrap px-1 sm:justify-self-auto">
                            {f.homeScore}:{f.awayScore}
                          </span>
                        ) : (
                          <span className="justify-self-center text-gray-400 font-mono text-sm whitespace-nowrap px-1 sm:justify-self-auto">vs</span>
                        )}
                        <span className="min-w-0 justify-self-end break-words text-right text-gray-900 font-semibold leading-tight sm:justify-self-auto sm:break-normal sm:text-left">
                          {displayTeamName(f.awayTeam)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 sm:mb-0.5 sm:mt-0 sm:shrink-0 sm:justify-end sm:self-end">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span
                          title={`Zakłady: ${betCount}/${totalPlayers}`}
                          className={`flex items-center gap-0.5 text-xs ${betCount > 0 ? 'text-green-500' : 'text-gray-300'}`}
                        >
                          👤
                          {totalPlayers > 0 && (
                            <span className="font-mono">{betCount}/{totalPlayers}</span>
                          )}
                        </span>
                        {f.status === 'locked' && totalPlayers > 0 && (
                          <span
                            title={`Trafienia: ${hitCount}/${totalPlayers}`}
                            className="flex items-center gap-0.5 text-xs"
                          >
                            🎯
                            <span className="font-mono">{hitCount}/{totalPlayers}</span>
                          </span>
                        )}
                        {hasFetchedOdds && (
                          <span title="Kursy pobrane przez hosta" className="text-blue-500">
                            📊
                          </span>
                        )}
                        {statusBadge(f.status, hasStarted)}
                      </div>
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
