import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Player } from '../db';
import {
  getLeaderboardData,
  type LeaderboardFormEntry,
  type LeaderboardRow,
  type LeaderboardStreak,
} from '../utils/scoring';
import { useSync } from '../sync/syncContextValue';
import { PlayerHistory } from '../components/PlayerHistory';
import { Tooltip } from '../components/Tooltip';
import { LeaderboardProgressChart } from '../components/LeaderboardProgressChart';
import { displayTeamName } from '../utils/displayNames';
import { formatPlayerName, leaderIdsFromRows } from '../utils/playerNames';
import { AlmostHitsSection } from '../components/leaderboard/AlmostHitsSection';
import { BestHitsSection } from '../components/leaderboard/BestHitsSection';
import { MatchStatsSection } from '../components/leaderboard/MatchStatsSection';
import {
  fixtureResultLabel,
  formResultLabel,
  formatPoints,
  matchCountLabel,
  scoreTypeLabel,
  shortDate,
} from '../components/leaderboard/formatters';

const MEDALS = ['🥇', '🥈', '🥉'];

function formEntryVisual(result: LeaderboardFormEntry['result']) {
  if (result === 'upcoming') return { className: 'bg-gray-200 text-gray-600', label: '?' };
  if (result === 'exact') return { className: 'bg-green-600 text-white', label: 'Z' };
  if (result === 'outcome') return { className: 'bg-yellow-300 text-yellow-900', label: 'R' };
  if (result === 'miss') return { className: 'bg-red-500 text-white', label: 'P' };
  return { className: 'bg-gray-200 text-gray-500', label: '-' };
}

function RankChangeIcon({ delta, hasLastFixture }: { delta: number; hasLastFixture: boolean }) {
  if (!hasLastFixture) {
    return null;
  }

  if (delta === 0) {
    return <span title="Bez zmian" className="text-gray-300 font-mono text-xs">-</span>;
  }

  if (delta > 0) {
    return <span title={`Awans o ${delta}`} className="text-green-600 font-semibold text-xs">↑{delta}</span>;
  }

  return <span title={`Spadek o ${Math.abs(delta)}`} className="text-red-500 font-semibold text-xs">↓{Math.abs(delta)}</span>;
}

function LastMatchPoints({ value, hasLastFixture }: { value: number; hasLastFixture: boolean }) {
  if (!hasLastFixture) {
    return null;
  }

  return (
    <span className={`text-xs font-normal ml-1 ${value > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
      ({value > 0 ? `+${formatPoints(value)}` : '+0.00'})
    </span>
  );
}

function FormDots({ entries }: { entries: LeaderboardFormEntry[] }) {
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

function FormStreak({ row }: { row: LeaderboardRow }) {
  return <FormDots entries={row.recentForm} />;
}

function StreakCard({
  title,
  streak,
  leaderIds,
}: {
  title: string;
  streak: LeaderboardStreak;
  leaderIds: ReadonlySet<string>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200">
          {streak.bestLength > 0 ? matchCountLabel(streak.bestLength) : '-'}
        </span>
      </div>
      {streak.bestLength > 0 ? (
        <div className="mt-3 space-y-2">
          {streak.winners.map((winner) => (
            <div key={winner.player.id} className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold text-gray-900">
                {formatPlayerName(winner.player, leaderIds)}
              </span>
              <span className="shrink-0">
                <FormDots entries={winner.entries} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-400">Brak serii.</p>
      )}
    </div>
  );
}

export function Leaderboard() {
  const { isViewer, playerId } = useSync();
  const data = useLiveQuery(() => getLeaderboardData(), []);
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null);
  const [recentEventsExpanded, setRecentEventsExpanded] = useState(false);

  if (!data) return <div className="text-gray-400 text-center py-12">Ładowanie…</div>;

  const leaderIds = leaderIdsFromRows(data.board);
  const visibleRecentEvents = recentEventsExpanded
    ? data.recentEvents
    : data.recentEvents.slice(0, 3);
  const hasMoreRecentEvents = data.recentEvents.length > 3;

  return (
    <div className="space-y-6">
      {historyPlayer && (
        <PlayerHistory player={historyPlayer} onClose={() => setHistoryPlayer(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tabela</h1>
        <span className="text-sm text-gray-500 bg-gray-100 rounded-full px-3 py-1">
          ⚽ {data.lockedCount} / {data.totalFixtures} meczów
        </span>
      </div>

      {data.board.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p>{isViewer ? 'Brak graczy w tej lidze.' : 'Brak graczy. Dodaj ich w zakładce Gracze!'}</p>
        </div>
      )}

      {data.board.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Ranking</h2>
              {data.lastFixture && (
                <p className="text-xs text-gray-400">
                  Po meczu {displayTeamName(data.lastFixture.homeTeam)} – {displayTeamName(data.lastFixture.awayTeam)}
                </p>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {data.board.length} {data.board.length === 1 ? 'gracz' : 'graczy'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2.5 text-left w-20">Miejsce</th>
                  <th className="px-4 py-2.5 text-left">Gracz</th>
                  <th className="px-4 py-2.5 text-left">Punkty</th>
                  <th className="px-4 py-2.5 text-center">Dokładne</th>
                  <th className="px-4 py-2.5 text-center">W/D/L</th>
                  <th className="px-4 py-2.5 text-center">Forma</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.board.map((row) => {
                  const rankClass =
                    row.currentPosition === 1
                      ? 'bg-yellow-100 text-yellow-800 ring-yellow-200'
                      : row.currentPosition === 2
                      ? 'bg-gray-100 text-gray-700 ring-gray-200'
                      : row.currentPosition === 3
                      ? 'bg-orange-100 text-orange-800 ring-orange-200'
                      : 'bg-white text-gray-500 ring-gray-200';
                  const rankLabel =
                    row.currentPosition <= MEDALS.length
                      ? MEDALS[row.currentPosition - 1]
                      : row.currentPosition;
                  return (
                    <tr
                      key={row.player.id}
                      className={`transition-colors hover:bg-green-50/40 ${
                        row.currentPosition === 1 ? 'bg-yellow-50/60' : 'bg-white'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold ring-1 ${rankClass}`}>
                            {rankLabel}
                          </span>
                          <RankChangeIcon delta={row.positionDelta} hasLastFixture={data.lastFixture != null} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setHistoryPlayer(row.player)}
                          className="text-left font-semibold text-gray-900 hover:text-green-700 transition-colors"
                        >
                          {formatPlayerName(row.player, leaderIds)}
                        </button>
                        {row.player.id === playerId && (
                          <span className="ml-2 text-[10px] text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">
                            ty
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-left whitespace-nowrap">
                        <div className="font-bold text-gray-900 text-base">
                          {formatPoints(row.total)}
                          <span className="text-xs font-normal text-gray-400 ml-1">pkt</span>
                          <LastMatchPoints value={row.lastMatchPoints} hasLastFixture={data.lastFixture != null} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-10 justify-center rounded-full bg-green-50 px-2 py-1 font-mono text-xs font-semibold text-green-700 ring-1 ring-green-100">
                          {row.exactHits}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex min-w-10 justify-center rounded-full bg-yellow-50 px-2 py-1 font-mono text-xs font-semibold text-yellow-700 ring-1 ring-yellow-100">
                          {row.outcomeHits}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <FormStreak row={row} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 border-t border-gray-100 p-4 md:grid-cols-3">
            <StreakCard title="Najdłuższa seria punktowa" streak={data.streaks.points} leaderIds={leaderIds} />
            <StreakCard title="Najdłuższa seria dokładnych" streak={data.streaks.exact} leaderIds={leaderIds} />
            <StreakCard title="Najdłuższa seria pudeł" streak={data.streaks.miss} leaderIds={leaderIds} />
          </div>
        </div>
      )}

      {data.board.length > 0 && (
        <LeaderboardProgressChart
          data={data.timeline}
          rows={data.board}
          leaderIds={leaderIds}
          currentPlayerId={playerId ?? undefined}
        />
      )}

      {/* Recent events */}
      {data.recentEvents.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Ostatnie zdarzenia</h2>
          <div className="space-y-1.5">
            {visibleRecentEvents.map((event) => {
              const groupPoints = event.events[0]?.score.points ?? 0;

              return (
                <div
                  key={event.id}
                  className="text-sm bg-white rounded-lg px-4 py-3 flex gap-3 items-start border border-gray-200"
                >
                  <span className="text-xs text-gray-400 w-16 shrink-0">{shortDate(event.fixture.date)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-700">
                      <span className="font-medium text-gray-900">{fixtureResultLabel(event)}</span>
                      <span className="text-gray-500">· {scoreTypeLabel(event)}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        {event.events.length} {event.events.length === 1 ? 'gracz' : 'graczy'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {event.events.map((entry) => (
                        <span key={entry.id} className="inline-flex min-w-0 items-center gap-1 text-xs">
                          <span className="max-w-32 truncate font-medium text-gray-900 sm:max-w-44">
                            {formatPlayerName(entry.player, leaderIds)}
                          </span>
                          {entry.player.id === playerId && (
                            <span className="text-[10px] text-blue-600 bg-blue-100 rounded-full px-1.5 py-0.5">
                              ty
                            </span>
                          )}
                          <span className="font-mono font-semibold text-gray-500">
                            {entry.score.betHomeScore}:{entry.score.betAwayScore}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-green-600 font-bold">
                    +{formatPoints(groupPoints)}
                  </span>
                </div>
              );
            })}
          </div>
          {hasMoreRecentEvents && (
            <button
              type="button"
              onClick={() => setRecentEventsExpanded((value) => !value)}
              className="mt-3 inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {recentEventsExpanded ? 'Zwiń' : 'Rozwiń'}
            </button>
          )}
        </div>
      ) : (
        data.board.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Ostatnie zdarzenia</h2>
            <p className="text-gray-400 text-sm bg-white border border-gray-200 rounded-lg px-4 py-6 text-center">
              Brak punktowanych zdarzeń.
            </p>
          </div>
        )
      )}

      <BestHitsSection
        hits={data.bestHits}
        leaderIds={leaderIds}
        currentPlayerId={playerId ?? undefined}
      />

      {data.board.length > 0 && (
        <MatchStatsSection stats={data.matchStats} leaderIds={leaderIds} currentPlayerId={playerId ?? undefined} />
      )}

      <AlmostHitsSection
        hits={data.almostHits}
        leaderIds={leaderIds}
        currentPlayerId={playerId ?? undefined}
      />
    </div>
  );
}
