import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Fixture, Player } from '../db';
import {
  getLeaderboardData,
  type LeaderboardData,
  type LeaderboardBiggestMiss,
  type LeaderboardEventGroup,
  type LeaderboardFixtureBetResult,
  type LeaderboardFormEntry,
  type LeaderboardLowHitMatch,
  type LeaderboardMatchPoints,
  type LeaderboardMissedOdd,
  type LeaderboardMissedOutcomeOddGroup,
  type LeaderboardRow,
  type LeaderboardStreak,
} from '../utils/scoring';
import { useSync } from '../sync/syncContextValue';
import { PlayerHistory } from '../components/PlayerHistory';
import { Tooltip } from '../components/Tooltip';
import { LeaderboardProgressChart } from '../components/LeaderboardProgressChart';
import { displayTeamName } from '../utils/displayNames';
import { formatPlayerName, leaderIdsFromRows } from '../utils/playerNames';

const MEDALS = ['🥇', '🥈', '🥉'];

function formatPoints(value: number) {
  return value.toFixed(2);
}

function shortDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  });
}

function fixtureTeamsLabel(fixture: Pick<Fixture, 'homeTeam' | 'awayTeam'>) {
  return `${displayTeamName(fixture.homeTeam)} – ${displayTeamName(fixture.awayTeam)}`;
}

function fixtureLabel(event: LeaderboardEventGroup) {
  return fixtureTeamsLabel(event.fixture);
}

function fixtureResultLabel(event: LeaderboardEventGroup) {
  if (event.fixture.homeScore == null || event.fixture.awayScore == null) {
    return fixtureLabel(event);
  }

  return `${displayTeamName(event.fixture.homeTeam)} ${event.fixture.homeScore}:${event.fixture.awayScore} ${displayTeamName(event.fixture.awayTeam)}`;
}

function fixtureScoreLabel(fixture: Fixture) {
  if (fixture.homeScore == null || fixture.awayScore == null) {
    return fixtureTeamsLabel(fixture);
  }

  return `${displayTeamName(fixture.homeTeam)} ${fixture.homeScore}:${fixture.awayScore} ${displayTeamName(fixture.awayTeam)}`;
}

function scoreTypeLabel(event: LeaderboardEventGroup) {
  return event.pointType === 'outcome' ? 'trafiony 1X2' : 'dokładny wynik';
}

function formResultLabel(result: LeaderboardFormEntry['result'], points: number) {
  if (result === 'upcoming') return 'Najbliższy mecz';
  if (result === 'none') return 'Brak obstawienia';
  if (result === 'miss') return 'Nietrafione';
  return `${result === 'exact' ? 'Dokładny wynik' : 'Trafiony W/D/L'} +${formatPoints(points)} pkt`;
}

function formEntryVisual(result: LeaderboardFormEntry['result']) {
  if (result === 'upcoming') return { className: 'bg-gray-200 text-gray-600', label: '?' };
  if (result === 'exact') return { className: 'bg-green-600 text-white', label: 'Z' };
  if (result === 'outcome') return { className: 'bg-yellow-300 text-yellow-900', label: 'R' };
  if (result === 'miss') return { className: 'bg-red-500 text-white', label: 'P' };
  return { className: 'bg-gray-200 text-gray-500', label: '-' };
}

function matchCountLabel(count: number) {
  if (count === 1) return '1 mecz';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} mecze`;
  }
  return `${count} meczów`;
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

function hitCountLabel(count: number) {
  if (count === 1) return '1 trafienie';
  return `${count} trafień`;
}

function MatchPointsRow({ entry }: { entry: LeaderboardMatchPoints }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900" title={fixtureTeamsLabel(entry.fixture)}>
          {fixtureScoreLabel(entry.fixture)}
        </div>
        <div className="mt-0.5 text-xs text-gray-400">
          {shortDate(entry.fixture.date)} · {hitCountLabel(entry.hitCount)}
          {entry.hitCount > 0 && (
            <span>
              {' '}· dokładne {entry.exactHitCount} · 1X2 {entry.outcomeHitCount}
            </span>
          )}
        </div>
      </div>
      <span className={`shrink-0 text-sm font-bold ${entry.totalPoints > 0 ? 'text-green-700' : 'text-gray-400'}`}>
        {formatPoints(entry.totalPoints)} pkt
      </span>
    </div>
  );
}

function betResultClass(result: LeaderboardFixtureBetResult['result']) {
  if (result === 'exact') return 'bg-green-50 text-green-700 ring-green-100';
  if (result === 'outcome') return 'bg-yellow-50 text-yellow-800 ring-yellow-100';
  if (result === 'miss') return 'bg-red-50 text-red-600 ring-red-100';
  return 'bg-gray-50 text-gray-400 ring-gray-100';
}

function BetResultChip({
  entry,
  leaderIds,
  currentPlayerId,
}: {
  entry: LeaderboardFixtureBetResult;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  const hasBet = entry.betHomeScore != null && entry.betAwayScore != null;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 rounded px-2 py-1 text-xs ring-1 ${betResultClass(entry.result)}`}>
      <span className="max-w-32 truncate font-semibold sm:max-w-44">
        {formatPlayerName(entry.player, leaderIds)}
      </span>
      {entry.player.id === currentPlayerId && (
        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
          ty
        </span>
      )}
      <span className="font-mono font-semibold">
        {hasBet ? `${entry.betHomeScore}:${entry.betAwayScore}` : 'brak'}
      </span>
      {entry.points > 0 && (
        <span className="font-bold">+{formatPoints(entry.points)}</span>
      )}
    </span>
  );
}

function LowHitMatchBlock({
  match,
  leaderIds,
  currentPlayerId,
}: {
  match: LeaderboardLowHitMatch;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900" title={fixtureTeamsLabel(match.fixture)}>
            {fixtureScoreLabel(match.fixture)}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {shortDate(match.fixture.date)} · {hitCountLabel(match.hitCount)} · {formatPoints(match.totalPoints)} pkt
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {match.playerResults.map((entry) => (
          <BetResultChip
            key={entry.player.id}
            entry={entry}
            leaderIds={leaderIds}
            currentPlayerId={currentPlayerId}
          />
        ))}
      </div>
    </div>
  );
}

function BiggestMissRow({
  miss,
  leaderIds,
  currentPlayerId,
}: {
  miss: LeaderboardBiggestMiss;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900">
          {formatPlayerName(miss.player, leaderIds)}
          {miss.player.id === currentPlayerId && (
            <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
              ty
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-gray-500" title={fixtureTeamsLabel(miss.fixture)}>
          {fixtureScoreLabel(miss.fixture)}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          typ <span className="font-mono font-semibold text-red-600">{miss.betHomeScore}:{miss.betAwayScore}</span>
          {' '}· wynik <span className="font-mono font-semibold text-gray-700">{miss.resultHomeScore}:{miss.resultAwayScore}</span>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 ring-1 ring-red-100">
        błąd {miss.error}
      </span>
    </div>
  );
}

function MissedOddRow({
  entry,
  leaderIds,
  currentPlayerId,
}: {
  entry: LeaderboardMissedOdd;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900">
          {formatPlayerName(entry.player, leaderIds)}
          {entry.player.id === currentPlayerId && (
            <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
              ty
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-gray-500" title={fixtureTeamsLabel(entry.fixture)}>
          {fixtureScoreLabel(entry.fixture)}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          typ <span className="font-mono font-semibold text-red-600">{entry.betHomeScore}:{entry.betAwayScore}</span>
          {' '}· wynik <span className="font-mono font-semibold text-gray-700">{entry.resultHomeScore}:{entry.resultAwayScore}</span>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200">
        {entry.odd.toFixed(2)}
      </span>
    </div>
  );
}

function MissedOutcomeOddGroup({
  group,
  leaderIds,
  currentPlayerId,
}: {
  group: LeaderboardMissedOutcomeOddGroup;
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900" title={fixtureTeamsLabel(group.fixture)}>
            {fixtureScoreLabel(group.fixture)}
          </div>
          <div className="mt-0.5 text-xs text-gray-400">
            {shortDate(group.fixture.date)} · {group.entries.length} {group.entries.length === 1 ? 'osoba' : 'osób'}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200">
          {group.odd.toFixed(2)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {group.entries.map((entry) => (
          <span key={entry.id} className="inline-flex min-w-0 items-center gap-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600 ring-1 ring-red-100">
            <span className="max-w-32 truncate font-semibold sm:max-w-44">
              {formatPlayerName(entry.player, leaderIds)}
            </span>
            {entry.player.id === currentPlayerId && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
                ty
              </span>
            )}
            <span className="font-mono font-semibold">{entry.betHomeScore}:{entry.betAwayScore}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MatchStatsSection({
  stats,
  leaderIds,
  currentPlayerId,
}: {
  stats: LeaderboardData['matchStats'];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}) {
  if (
    stats.topScoring.length === 0 &&
    stats.zeroHitFixtures.length === 0 &&
    stats.lowHitMatches.length === 0 &&
    stats.biggestMisses.length === 0 &&
    stats.missedOdds.lowest.length === 0 &&
    stats.missedOdds.lowestOutcome.length === 0 &&
    stats.missedOdds.highestOutcome.length === 0 &&
    stats.missedOdds.highest.length === 0 &&
    stats.fullyHitFixtures.length === 0
  ) {
    return null;
  }

  const lowHitLabel = stats.lowHitMatches[0]
    ? hitCountLabel(stats.lowHitMatches[0].hitCount)
    : '-';

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Mecze w liczbach</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najbardziej punktodajny mecz</h3>
            <span className="text-[10px] font-semibold text-gray-400">{stats.topScoring.length > 1 ? 'ex aequo' : ''}</span>
          </div>
          {stats.topScoring.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {stats.topScoring.map((entry) => (
                <MatchPointsRow key={entry.fixture.id} entry={entry} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak punktowanych meczów.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najmniej punktodajne mecze</h3>
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-100">
              0 trafień
            </span>
          </div>
          {stats.zeroHitFixtures.length > 0 ? (
            <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
              {stats.zeroHitFixtures.map((entry) => (
                <MatchPointsRow key={entry.fixture.id} entry={entry} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Nie ma jeszcze meczu bez trafienia.</p>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Samotny strzał</h3>
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
              {lowHitLabel}
            </span>
          </div>
          {stats.lowHitMatches.length > 0 ? (
            <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {stats.lowHitMatches.map((match) => (
                <LowHitMatchBlock
                  key={match.fixture.id}
                  match={match}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak zamkniętych meczów do pokazania.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najbardziej ustrzelone mecze</h3>
            <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 ring-1 ring-green-100">
              wszyscy
            </span>
          </div>
          {stats.fullyHitFixtures.length > 0 ? (
            <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
              {stats.fullyHitFixtures.map((entry) => (
                <MatchPointsRow key={entry.fixture.id} entry={entry} />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak meczu, w którym punktowali wszyscy.</p>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najniższy spudłowany kurs</h3>
          </div>
          {stats.missedOdds.lowest.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {stats.missedOdds.lowest.map((entry) => (
                <MissedOddRow
                  key={entry.id}
                  entry={entry}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak spudłowanych typów z kursem.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najwyższy spudłowany kurs</h3>
          </div>
          {stats.missedOdds.highest.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {stats.missedOdds.highest.map((entry) => (
                <MissedOddRow
                  key={entry.id}
                  entry={entry}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak spudłowanych typów z kursem.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najniższy spudłowany 1X2</h3>
          </div>
          {stats.missedOdds.lowestOutcome.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {stats.missedOdds.lowestOutcome.map((group) => (
                <MissedOutcomeOddGroup
                  key={group.id}
                  group={group}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak spudłowanych 1X2 z kursem.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najwyższy spudłowany 1X2</h3>
          </div>
          {stats.missedOdds.highestOutcome.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {stats.missedOdds.highestOutcome.map((group) => (
                <MissedOutcomeOddGroup
                  key={group.id}
                  group={group}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak spudłowanych 1X2 z kursem.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Największe pudła</h3>
          </div>
          <p className="mb-2 text-xs leading-relaxed text-gray-400">
            Top 5. Liczone jako |typ gospodarzy - gole gospodarzy| + |typ gości - gole gości| dla typów bez punktów.
          </p>
          {stats.biggestMisses.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {stats.biggestMisses.map((miss) => (
                <BiggestMissRow
                  key={miss.id}
                  miss={miss}
                  leaderIds={leaderIds}
                  currentPlayerId={currentPlayerId}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-gray-400">Brak nietrafionych typów z zapisanym wynikiem.</p>
          )}
        </div>
      </div>
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
  const fixtureById = new Map(data.timeline.map((point) => [point.fixture.id, point.fixture]));
  const visibleRecentEvents = recentEventsExpanded
    ? data.recentEvents
    : data.recentEvents.slice(0, 3);
  const hasMoreRecentEvents = data.recentEvents.length > 3;
  const bestHits = data.board
    .flatMap(({ player, history }) =>
      history.map((score) => ({
        ...score,
        playerName: formatPlayerName(player, leaderIds),
        fixture: fixtureById.get(score.fixtureId),
      })),
    )
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

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

      {/* Best scores */}
      {bestHits.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Najlepsze trafienia</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bestHits.map((hit, index) => {
              const fixtureName = hit.fixture
                ? `${displayTeamName(hit.fixture.homeTeam)} – ${displayTeamName(hit.fixture.awayTeam)}`
                : 'Mecz';
              const isExact = hit.pointType !== 'outcome';

              return (
                <div
                  key={String(hit.id ?? `${hit.playerId}:${hit.fixtureId}`)}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-gray-900 px-2 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isExact
                            ? 'bg-green-50 text-green-700 ring-1 ring-green-100'
                            : 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-100'
                        }`}
                      >
                        {isExact ? 'dokładny' : 'W/D/L'}
                      </span>
                    </div>
                    <span className="text-base font-bold text-green-700">+{formatPoints(hit.points)}</span>
                  </div>

                  <div className="font-semibold text-gray-900 truncate">{hit.playerName}</div>
                  <div className="mt-1 text-xs text-gray-500 truncate" title={fixtureName}>
                    {fixtureName}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-gray-50 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-gray-400">Typ</div>
                      <div className="font-mono font-semibold text-gray-800">
                        {hit.betHomeScore}:{hit.betAwayScore}
                      </div>
                    </div>
                    <div className="rounded bg-green-50 px-2 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-green-600">Wynik</div>
                      <div className="font-mono font-semibold text-green-800">
                        {hit.resultHomeScore}:{hit.resultAwayScore}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.board.length > 0 && (
        <MatchStatsSection stats={data.matchStats} leaderIds={leaderIds} currentPlayerId={playerId ?? undefined} />
      )}
    </div>
  );
}
