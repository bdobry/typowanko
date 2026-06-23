import type { LeaderboardFormEntry } from '../../utils/scoring';
import { displayTeamName } from '../../utils/displayNames';
import { Tooltip } from '../Tooltip';
import { formResultLabel } from './formatters';

function formEntryVisual(result: LeaderboardFormEntry['result']) {
  if (result === 'upcoming') return { className: 'bg-gray-200 text-gray-600', label: '?' };
  if (result === 'exact') return { className: 'bg-green-600 text-white', label: 'Z' };
  if (result === 'outcome') return { className: 'bg-yellow-300 text-yellow-900', label: 'R' };
  if (result === 'miss') return { className: 'bg-red-500 text-white', label: 'P' };
  return { className: 'bg-gray-200 text-gray-500', label: '-' };
}

export function FormDots({ entries }: { entries: LeaderboardFormEntry[] }) {
  if (entries.length === 0) {
    return <span className="text-gray-300 font-mono">-</span>;
  }

  return (
    <span className="inline-flex items-center justify-center gap-1">
      {entries.map((entry) => {
        const { className, label } = formEntryVisual(entry.result);
        const hasBet = entry.betHomeScore != null && entry.betAwayScore != null;
        const fixtureName = `${displayTeamName(entry.fixture.homeTeam)} - ${displayTeamName(entry.fixture.awayTeam)}`;

        return (
          <Tooltip
            key={entry.fixture.id}
            content={
              <span className="block">
                <span className="block text-sm font-bold">
                  {hasBet ? `${entry.betHomeScore}:${entry.betAwayScore}` : '-'} ({fixtureName})
                </span>
                <span className="block text-gray-300">{entry.fixture.date}</span>
                <span className="mt-1 block text-gray-100">{formResultLabel(entry.result, entry.points)}</span>
              </span>
            }
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${className}`}
            >
              {label}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}
