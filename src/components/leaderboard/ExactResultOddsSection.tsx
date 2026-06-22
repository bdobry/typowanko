import { useState } from 'react';
import type { LeaderboardExactResultOddMatch } from '../../utils/scoring';
import { formatPlayerName } from '../../utils/playerNames';
import { fixtureTeamsLabel, shortDate } from './formatters';

const TOP_LIMIT = 10;

interface ExactResultOddsSectionProps {
  matches: LeaderboardExactResultOddMatch[];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}

export function ExactResultOddsSection({
  matches,
  leaderIds,
  currentPlayerId,
}: ExactResultOddsSectionProps) {
  const [displayMode, setDisplayMode] = useState<'top' | 'all'>('top');
  const visibleMatches = displayMode === 'all' ? matches : matches.slice(0, TOP_LIMIT);
  const hasMore = matches.length > TOP_LIMIT;

  if (matches.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Najwyższe kursy
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
            {visibleMatches.length} / {matches.length}
          </span>
          {hasMore && (
            <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setDisplayMode('top')}
                className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                  displayMode === 'top'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Top 10
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('all')}
                className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                  displayMode === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Wszystkie
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                <th className="w-10 px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Mecz</th>
                <th className="w-16 px-3 py-2 text-center">Wynik</th>
                <th className="w-20 px-3 py-2 text-right">Kurs</th>
                <th className="px-3 py-2 text-left">Trafili</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleMatches.map((match, index) => {
                const hasHits = match.hits.length > 0;
                const hitNames = match.hits.map((hit) => formatPlayerName(hit.player, leaderIds));
                const hitNamesLabel = hitNames.join(', ');
                const result =
                  match.fixture.homeScore != null && match.fixture.awayScore != null
                    ? `${match.fixture.homeScore}:${match.fixture.awayScore}`
                    : '-';

                return (
                  <tr
                    key={match.fixture.id}
                    className={`transition-colors ${
                      hasHits ? 'hover:bg-green-50/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-[11px] font-semibold text-gray-400">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2">
                      <div className="truncate font-medium text-gray-900" title={fixtureTeamsLabel(match.fixture)}>
                        {fixtureTeamsLabel(match.fixture)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-400">{shortDate(match.fixture.date)}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-semibold text-gray-900">
                      {result}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {match.odd == null ? (
                        <span className="font-mono font-semibold text-gray-300">-</span>
                      ) : (
                        <span
                          className={`inline-flex min-w-14 justify-center rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ring-1 ${
                            hasHits
                              ? 'bg-green-50 text-green-700 ring-green-100'
                              : 'bg-gray-100 text-gray-700 ring-gray-200'
                          }`}
                        >
                          {match.odd.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {hasHits ? (
                        <span className="block truncate font-semibold text-green-700" title={hitNamesLabel}>
                          {match.hits.map((hit, hitIndex) => (
                            <span key={hit.id}>
                              {hitIndex > 0 && ', '}
                              {formatPlayerName(hit.player, leaderIds)}
                              {hit.player.id === currentPlayerId && (
                                <span className="ml-1 rounded-full bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-600">
                                  ty
                                </span>
                              )}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
