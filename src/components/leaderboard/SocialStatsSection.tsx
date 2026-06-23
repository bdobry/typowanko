import type {
  LeaderboardCrowdContrarianEvent,
  LeaderboardData,
  LeaderboardSimilarPair,
} from '../../utils/scoring';
import { formatPlayerName } from '../../utils/playerNames';
import { fixtureTeamsLabel, formatPoints } from './formatters';

const ROW_LIMIT = 8;
const HIT_LIMIT = 4;
const MIN_SIMILARITY = 45;

interface SocialStatsSectionProps {
  stats: LeaderboardData['socialStats'];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}

function outcomeLabel(outcome: LeaderboardCrowdContrarianEvent['crowdOutcome']) {
  if (outcome === 'home') return '1';
  if (outcome === 'draw') return 'X';
  return '2';
}

function PlayerLabel({
  player,
  leaderIds,
  currentPlayerId,
}: {
  player: LeaderboardSimilarPair['players'][number];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  return (
    <span className="min-w-0 truncate font-semibold text-gray-900">
      {formatPlayerName(player, leaderIds)}
      {player.id === currentPlayerId && (
        <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
          ty
        </span>
      )}
    </span>
  );
}

function MiniStat({
  label,
  value,
  hitValue,
  tone = 'gray',
}: {
  label: string;
  value: number | string;
  hitValue?: number;
  tone?: 'gray' | 'yellow' | 'green';
}) {
  const className =
    tone === 'green'
      ? 'bg-green-50 text-green-700 ring-green-100'
      : tone === 'yellow'
      ? 'bg-yellow-50 text-yellow-800 ring-yellow-100'
      : 'bg-gray-50 text-gray-700 ring-gray-100';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ${className}`}>
      <span className="text-gray-400">{label}</span>
      <span className="font-mono font-bold">
        {value}
        {hitValue != null && <span className="text-gray-400"> ({hitValue})</span>}
      </span>
    </span>
  );
}

function ContrarianHitRow({
  hit,
  leaderIds,
  currentPlayerId,
}: {
  hit: LeaderboardCrowdContrarianEvent;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  const playerName = formatPlayerName(hit.player, leaderIds);
  const isCurrentPlayer = hit.player.id === currentPlayerId;

  return (
    <div
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs ring-1 ring-green-100"
      title={`${fixtureTeamsLabel(hit.fixture)} · typ ${outcomeLabel(hit.playerOutcome)}, tłum ${outcomeLabel(hit.crowdOutcome)} (${hit.crowdCount}/${hit.totalBets})`}
    >
      <span className="max-w-36 truncate font-semibold text-gray-900 sm:max-w-52">
        {playerName}
      </span>
      {isCurrentPlayer && (
        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
          ty
        </span>
      )}
      <span className="shrink-0 font-mono font-semibold text-gray-600">
        {hit.betHomeScore}:{hit.betAwayScore}
      </span>
      <span className="shrink-0 font-bold text-green-700">
        +{formatPoints(hit.points)}
      </span>
      <span className="shrink-0 text-gray-400">
        vs typ {outcomeLabel(hit.crowdOutcome)}
      </span>
    </div>
  );
}

function SimilarPairRow({
  pair,
  leaderIds,
  currentPlayerId,
  rank,
}: {
  pair: LeaderboardSimilarPair;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
  rank: number;
}) {
  const [firstPlayer, secondPlayer] = pair.players;

  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <span className="shrink-0 font-mono text-xs font-semibold text-gray-400">{rank}.</span>
            <PlayerLabel player={firstPlayer} leaderIds={leaderIds} currentPlayerId={currentPlayerId} />
            <span className="text-gray-300">+</span>
            <PlayerLabel player={secondPlayer} leaderIds={leaderIds} currentPlayerId={currentPlayerId} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <MiniStat label="wspólne" value={pair.sharedBetCount} hitValue={pair.sharedHitCount} />
            <MiniStat label="1X2" value={pair.outcomeMatchCount} hitValue={pair.outcomeMatchHitCount} tone="yellow" />
            <MiniStat label="dokł." value={pair.exactMatchCount} hitValue={pair.exactMatchHitCount} tone="green" />
          </div>
        </div>
        <div className="w-20 shrink-0 text-right">
          <div className="text-sm font-bold text-gray-900">{pair.similarity.toFixed(0)}%</div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-green-600"
              style={{ width: `${Math.max(0, Math.min(100, pair.similarity))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SocialStatsSection({
  stats,
  leaderIds,
  currentPlayerId,
}: SocialStatsSectionProps) {
  const contrarianRows = stats.contrarianRows.slice(0, ROW_LIMIT);
  const contrarianHits = stats.contrarianHits.slice(0, HIT_LIMIT);
  const similarPairs = stats.similarPairs
    .filter((pair) => pair.similarity >= MIN_SIMILARITY)
    .slice(0, ROW_LIMIT);

  if (contrarianRows.length === 0 && similarPairs.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Typowanie społeczne</h2>
      <div className="grid min-w-0 gap-3">
        <div className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Kontra tłumu</h3>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
              top {ROW_LIMIT}
            </span>
          </div>
          {contrarianRows.length > 0 ? (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="w-10 py-2 pr-3 text-left">#</th>
                    <th className="py-2 pr-3 text-left">Gracz</th>
                    <th className="py-2 px-3 text-right">Pod prąd</th>
                    <th className="py-2 px-3 text-right">Traf.</th>
                    <th className="py-2 px-3 text-right">Pkt</th>
                    <th className="py-2 pl-3 text-left">Najlepszy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contrarianRows.map((row, index) => (
                    <tr key={row.player.id} className="transition-colors hover:bg-green-50/40">
                      <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-gray-400">
                        {index + 1}
                      </td>
                      <td className="py-2.5 pr-3">
                        <PlayerLabel player={row.player} leaderIds={leaderIds} currentPlayerId={currentPlayerId} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-700">
                        {row.againstCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-gray-700">
                        {row.hitCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-green-700">
                        {formatPoints(row.points)}
                      </td>
                      <td className="py-2.5 pl-3">
                        {row.bestEvent ? (
                          <div className="min-w-0">
                            <div className="font-mono text-xs font-semibold text-gray-700">
                              {row.bestEvent.betHomeScore}:{row.bestEvent.betAwayScore}
                              <span className="ml-1 text-green-700">
                                +{formatPoints(row.bestEvent.points)}
                              </span>
                            </div>
                            <div className="truncate text-[11px] text-gray-400" title={fixtureTeamsLabel(row.bestEvent.fixture)}>
                              {fixtureTeamsLabel(row.bestEvent.fixture)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak jednoznacznych typów przeciw większości.</p>
          )}
          {contrarianHits.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Najlepsze wejścia pod prąd
              </div>
              <div className="flex flex-wrap gap-1.5">
                {contrarianHits.map((hit) => (
                  <ContrarianHitRow
                    key={hit.id}
                    hit={hit}
                    leaderIds={leaderIds}
                    currentPlayerId={currentPlayerId}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najbardziej podobni typerzy</h3>
            <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 ring-1 ring-green-100">
              zgodność
            </span>
          </div>
          <p className="mb-3 max-w-3xl text-xs leading-relaxed text-gray-400">
            Pary od {MIN_SIMILARITY}% zgodności. Liczby w nawiasach pokazują, ile takich wspólnych typów punktowało.
            Przy dokł. nawias zlicza też jeśli ostatecznie weszło tylko 1X2.
          </p>
          {similarPairs.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {similarPairs.map((pair, index) => (
                <SimilarPairRow
                  key={pair.id}
                  pair={pair}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                  rank={index + 1}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak par z typami na te same mecze.</p>
          )}
        </div>
      </div>
    </div>
  );
}
