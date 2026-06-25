import { useState } from 'react';
import type { Player } from '../../db';
import type {
  LeaderboardPeriodLeaderboard,
  LeaderboardPeriodRow,
} from '../../utils/scoring';
import { formatPlayerName } from '../../utils/playerNames';
import { PlayerOnlineStatusDot } from '../PlayerOnlineStatus';
import { FormDots } from './FormDots';
import { formatPoints, matchCountLabel } from './formatters';

interface PeriodLeaderboardSectionProps {
  periods: LeaderboardPeriodLeaderboard[];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
  onSelectPlayer: (player: Player) => void;
}

function rankClass(position: number) {
  if (position === 1) return 'bg-yellow-100 text-yellow-800 ring-yellow-200';
  if (position === 2) return 'bg-gray-100 text-gray-700 ring-gray-200';
  if (position === 3) return 'bg-orange-100 text-orange-800 ring-orange-200';
  return 'bg-white text-gray-500 ring-gray-200';
}

function countLabel(period: LeaderboardPeriodLeaderboard) {
  const lockedCount = period.option.lockedFixtureIds.length;
  const totalCount = period.option.fixtureIds.length;

  if (totalCount > 0 && lockedCount !== totalCount) {
    return `${lockedCount}/${totalCount} zakończonych`;
  }

  return matchCountLabel(lockedCount);
}

function PeriodRow({
  row,
  leaderIds,
  currentPlayerId,
  onSelectPlayer,
}: {
  row: LeaderboardPeriodRow;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
  onSelectPlayer: (player: Player) => void;
}) {
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onSelectPlayer(row.player)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectPlayer(row.player);
        }
      }}
      className="group cursor-pointer border-b border-gray-900/15 transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
    >
      <td className="px-4 py-2.5">
        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ring-1 ${rankClass(row.currentPosition)}`}>
          {row.currentPosition}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-flex min-w-0 items-center gap-2">
          <PlayerOnlineStatusDot lastOnlineAt={row.player.lastOnlineAt} />
          <span className="truncate font-semibold text-gray-900 transition-colors group-hover:text-green-700">
            {formatPlayerName(row.player, leaderIds)}
          </span>
        </span>
        {row.player.id === currentPlayerId && (
          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-600">
            ty
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-left whitespace-nowrap">
        <span className="font-bold text-gray-900">{formatPoints(row.total)}</span>
        <span className="ml-1 text-xs text-gray-400">pkt</span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className="inline-flex min-w-9 justify-center rounded-full bg-green-50 px-2 py-0.5 font-mono text-xs font-semibold text-green-700 ring-1 ring-green-100">
          {row.exactHits}
        </span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className="inline-flex min-w-9 justify-center rounded-full bg-yellow-50 px-2 py-0.5 font-mono text-xs font-semibold text-yellow-700 ring-1 ring-yellow-100">
          {row.outcomeHits}
        </span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <FormDots entries={row.recentForm} />
      </td>
    </tr>
  );
}

export function PeriodLeaderboardSection({
  periods,
  leaderIds,
  currentPlayerId,
  onSelectPlayer,
}: PeriodLeaderboardSectionProps) {
  const [selectedPeriodId, setSelectedPeriodId] = useState('last-five');
  const selectedPeriod = periods.find((period) => period.option.id === selectedPeriodId) ?? periods[0];

  if (!selectedPeriod) return null;

  const quickPeriods = periods.filter((period) => period.option.category === 'quick');
  const groupRoundPeriods = periods.filter((period) => period.option.category === 'group_round');
  const groupPeriods = periods.filter((period) => period.option.category === 'group');
  const knockoutPeriods = periods.filter((period) => period.option.category === 'knockout');
  const detailedPeriodSelected = selectedPeriod.option.category !== 'quick';
  const emptyText =
    selectedPeriod.option.lockedFixtureIds.length === 0
      ? 'Brak zakończonych meczów w tym zakresie.'
      : 'Brak graczy do pokazania.';
  const shouldShowTeamLabel =
    selectedPeriod.option.category !== 'group_round' && selectedPeriod.option.teamLabel != null;
  const selectedPeriodLabel = shouldShowTeamLabel
    ? `${selectedPeriod.option.label} (${selectedPeriod.option.teamLabel})`
    : selectedPeriod.option.label;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-900 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-900 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-950">Mini tabela</h2>
          <p className="mt-0.5 max-w-4xl break-words text-xs leading-snug text-gray-500">
            {selectedPeriodLabel}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 ring-1 ring-gray-900">
          {countLabel(selectedPeriod)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-900/30 px-4 py-3">
        <div className="flex w-full gap-2 overflow-x-auto sm:w-auto sm:overflow-visible">
          {quickPeriods.map((period) => (
            <button
              key={period.option.id}
              type="button"
              onClick={() => setSelectedPeriodId(period.option.id)}
              className={`shrink-0 rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
                selectedPeriod.option.id === period.option.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 ring-1 ring-gray-900/20 hover:text-gray-950'
              }`}
            >
              {period.option.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Szczegółowy zakres mini tabeli"
          value={detailedPeriodSelected ? selectedPeriod.option.id : ''}
          onChange={(event) => setSelectedPeriodId(event.target.value)}
          className="min-w-0 flex-1 rounded border border-gray-900/30 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-gray-900 focus:outline-none sm:flex-none sm:min-w-56"
        >
          <option value="" disabled>
            Szczegółowy zakres
          </option>
          {groupRoundPeriods.length > 0 && (
            <optgroup label="Kolejki grupowe">
              {groupRoundPeriods.map((period) => (
                <option key={period.option.id} value={period.option.id}>
                  {period.option.label}
                </option>
              ))}
            </optgroup>
          )}
          {groupPeriods.length > 0 && (
            <optgroup label="Grupy">
              {groupPeriods.map((period) => (
                <option key={period.option.id} value={period.option.id}>
                  {period.option.label}
                </option>
              ))}
            </optgroup>
          )}
          {knockoutPeriods.length > 0 && (
            <optgroup label="Drabinka">
              {knockoutPeriods.map((period) => (
                <option key={period.option.id} value={period.option.id}>
                  {period.option.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {selectedPeriod.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[660px] text-sm">
            <thead>
              <tr className="bg-gray-900 text-[11px] uppercase tracking-wider text-white">
                <th className="w-20 px-4 py-2.5 text-left">Miejsce</th>
                <th className="px-4 py-2.5 text-left">Gracz</th>
                <th className="px-4 py-2.5 text-left">Punkty</th>
                <th className="px-4 py-2.5 text-center">Dokładne</th>
                <th className="px-4 py-2.5 text-center">1X2</th>
                <th className="px-4 py-2.5 text-center">Forma</th>
              </tr>
            </thead>
            <tbody>
              {selectedPeriod.rows.map((row) => (
                <PeriodRow
                  key={row.player.id}
                  row={row}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                  onSelectPlayer={onSelectPlayer}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
