import type {
  LeaderboardBiggestMiss,
  LeaderboardData,
  LeaderboardFixtureBetResult,
  LeaderboardLowHitMatch,
  LeaderboardMatchPoints,
  LeaderboardMissedOdd,
  LeaderboardMissedOutcomeOddGroup,
} from '../../utils/scoring';
import { formatPlayerName } from '../../utils/playerNames';
import {
  fixtureScoreLabel,
  fixtureTeamsLabel,
  formatPoints,
  hitCountLabel,
  shortDate,
} from './formatters';

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

interface MatchStatsSectionProps {
  stats: LeaderboardData['matchStats'];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}

export function MatchStatsSection({ stats, leaderIds, currentPlayerId }: MatchStatsSectionProps) {
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
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Mecze w liczbach</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Najbardziej punktodajne mecze</h3>
            <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 ring-1 ring-green-100">
              top 5
            </span>
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Top 5 pudeł</h3>
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 ring-1 ring-red-100">
              kurs
            </span>
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
