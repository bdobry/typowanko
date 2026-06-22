import { useMemo, useState } from 'react';
import type { LeaderboardAlmostHit } from '../../utils/scoring';
import { formatPlayerName } from '../../utils/playerNames';
import { fixtureTeamsLabel, formatPoints, shortDate } from './formatters';

const TOP_LIMIT = 10;
const ALL_PLAYERS = 'all';

interface AlmostHitsSectionProps {
  hits: LeaderboardAlmostHit[];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}

export function AlmostHitsSection({ hits, leaderIds, currentPlayerId }: AlmostHitsSectionProps) {
  const [viewMode, setViewMode] = useState<'table' | 'countRanking' | 'pointsRanking'>('table');
  const [displayMode, setDisplayMode] = useState<'top' | 'all'>('top');
  const [selectedPlayerId, setSelectedPlayerId] = useState(ALL_PLAYERS);
  const playerOptions = useMemo(() => {
    const playersById = new Map(hits.map((hit) => [hit.player.id, hit.player]));
    return [...playersById.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl-PL'));
  }, [hits]);
  const filteredHits = useMemo(
    () => hits.filter((hit) => selectedPlayerId === ALL_PLAYERS || hit.player.id === selectedPlayerId),
    [hits, selectedPlayerId],
  );
  const visibleHits = displayMode === 'all' ? filteredHits : filteredHits.slice(0, TOP_LIMIT);
  const selectedPlayerTotal = useMemo(
    () => filteredHits.reduce((sum, hit) => sum + hit.odd, 0),
    [filteredHits],
  );
  const rankingRows = useMemo(() => {
    const rowsByPlayerId = new Map<
      string,
      { player: LeaderboardAlmostHit['player']; count: number; lostPoints: number }
    >();

    for (const hit of hits) {
      const row = rowsByPlayerId.get(hit.player.id) ?? {
        player: hit.player,
        count: 0,
        lostPoints: 0,
      };
      row.count += 1;
      row.lostPoints += hit.odd;
      rowsByPlayerId.set(hit.player.id, row);
    }

    return [...rowsByPlayerId.values()];
  }, [hits]);
  const sortedRankingRows = useMemo(
    () =>
      [...rankingRows].sort((a, b) => {
        if (viewMode === 'countRanking' && b.count !== a.count) return b.count - a.count;
        if (b.lostPoints !== a.lostPoints) return b.lostPoints - a.lostPoints;
        if (b.count !== a.count) return b.count - a.count;
        return a.player.name.localeCompare(b.player.name, 'pl-PL');
      }),
    [rankingRows, viewMode],
  );

  if (hits.length === 0) return null;
  const isPlayerSelected = selectedPlayerId !== ALL_PLAYERS;
  const showRanking = viewMode !== 'table';

  return (
    <div>
      <div className="mb-3 space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Ale by było<sup className="ml-0.5 text-[9px] leading-none">™</sup>
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-400">
            Najwyższe kursy typów, które nie weszły, ale dokładny wynik minął się z końcowym rezultatem o 1 bramkę.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Tabela
            </button>
            <button
              type="button"
              onClick={() => setViewMode('countRanking')}
              className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                viewMode === 'countRanking'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Ranking pudeł
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pointsRanking')}
              className={`h-8 rounded px-3 text-xs font-semibold transition-colors ${
                viewMode === 'pointsRanking'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Ranking straty
            </button>
          </div>
        </div>
        {!showRanking && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Filtry
            </span>
            <div className="mr-2.5 inline-flex rounded-md border border-gray-200 bg-white p-0.5">
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
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              Gracz
              <select
                value={selectedPlayerId}
                onChange={(event) => setSelectedPlayerId(event.target.value)}
                className="h-9 min-w-44 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 outline-none transition-colors hover:bg-gray-50 focus:border-gray-300"
              >
                <option value={ALL_PLAYERS}>Wszyscy</option>
                {playerOptions.map((player) => (
                  <option key={player.id} value={player.id}>
                    {formatPlayerName(player, leaderIds)}
                  </option>
                ))}
              </select>
            </label>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
              {visibleHits.length} / {filteredHits.length}
            </span>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {showRanking ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="w-14 px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Gracz</th>
                  <th className="px-4 py-2.5 text-right">Pudła o 1</th>
                  <th className="px-4 py-2.5 text-right">Stracone pkt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRankingRows.map((row, index) => (
                  <tr key={row.player.id} className="transition-colors hover:bg-yellow-50/40">
                    <td className="px-4 py-3">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gray-900 px-2 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900">
                        {formatPlayerName(row.player, leaderIds)}
                      </span>
                      {row.player.id === currentPlayerId && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-600">
                          ty
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                      {row.count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex min-w-16 justify-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 ring-1 ring-red-100">
                        {formatPoints(row.lostPoints)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="w-14 px-4 py-2.5 text-left">#</th>
                    <th className="px-4 py-2.5 text-left">Gracz</th>
                    <th className="px-4 py-2.5 text-right">Kurs</th>
                    <th className="px-4 py-2.5 text-left">Mecz</th>
                    <th className="px-4 py-2.5 text-center">Wynik</th>
                    <th className="px-4 py-2.5 text-center">Typ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleHits.map((hit, index) => (
                    <tr key={hit.id} className="transition-colors hover:bg-yellow-50/40">
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gray-900 px-2 text-xs font-bold text-white">
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900">
                          {formatPlayerName(hit.player, leaderIds)}
                        </span>
                        {hit.player.id === currentPlayerId && (
                          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-600">
                            ty
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex min-w-14 justify-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 ring-1 ring-red-100">
                          {hit.odd.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate font-medium text-gray-900" title={fixtureTeamsLabel(hit.fixture)}>
                          {fixtureTeamsLabel(hit.fixture)}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">{shortDate(hit.fixture.date)}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono font-semibold text-gray-900">
                          {hit.resultHomeScore}:{hit.resultAwayScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono font-semibold text-red-600">
                          {hit.betHomeScore}:{hit.betAwayScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isPlayerSelected && (
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Suma potencjalnych punktów
                </span>
                <span className="font-bold text-red-600">{formatPoints(selectedPlayerTotal)} pkt</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
