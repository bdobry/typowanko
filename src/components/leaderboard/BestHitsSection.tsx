import type { LeaderboardBestHit } from '../../utils/scoring';
import { formatPlayerName } from '../../utils/playerNames';
import { fixtureScoreLabel, formatPoints, shortDate } from './formatters';

interface BestHitsSectionProps {
  hits: LeaderboardBestHit[];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}

export function BestHitsSection({ hits, leaderIds, currentPlayerId }: BestHitsSectionProps) {
  if (hits.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Najlepsze trafienia</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="w-14 px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Gracz</th>
                  <th className="px-4 py-2.5 text-right">Punkty</th>
                  <th className="px-4 py-2.5 text-left">Mecz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hits.map((hit, index) => {
                  const playerName = formatPlayerName(hit.player, leaderIds);

                  return (
                    <tr key={hit.id} className="transition-colors hover:bg-green-50/40">
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gray-900 px-2 text-xs font-bold text-white">
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900">{playerName}</span>
                        {hit.player.id === currentPlayerId && (
                          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-600">
                            ty
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">
                        +{formatPoints(hit.points)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate font-medium text-gray-900" title={fixtureScoreLabel(hit.fixture)}>
                          {fixtureScoreLabel(hit.fixture)}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">{shortDate(hit.fixture.date)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
