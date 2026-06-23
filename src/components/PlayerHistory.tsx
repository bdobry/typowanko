import { useEffect, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Bet, type Fixture, type MatchOdd, type Odd, type Player, type ScoreEntry } from '../db';
import { Tooltip } from './Tooltip';
import {
  getLeaderboardData,
  type LeaderboardData,
  type LeaderboardFormEntry,
  type LeaderboardSimilarPair,
} from '../utils/scoring';
import { compareFixturesByKickoff } from '../utils/fixtureTime';
import { formatPlayerName, leaderIdsFromRows } from '../utils/playerNames';
import { PlayerOnlineStatusDot } from './PlayerOnlineStatus';
import { FormDots } from './leaderboard/FormDots';
import {
  fixtureScoreLabel,
  fixtureTeamsLabel,
  formatPoints,
  matchCountLabel,
  shortDate,
} from './leaderboard/formatters';

type StoredScoreEntry = ScoreEntry & { id?: number };
type BetResultKind = 'exact' | 'outcome' | 'miss' | 'pending';

interface PlayerHistoryRow {
  id: string;
  bet: Bet;
  fixture?: Fixture;
  score?: StoredScoreEntry;
  result: BetResultKind;
  points: number;
  exactOdd: number | null;
  outcomeOdd: number | null;
  error: number | null;
}

interface PlayerFormRun {
  entries: LeaderboardFormEntry[];
  points: number;
}

function formatLastOnline(value?: number) {
  if (!value) return 'brak danych';
  return new Date(value).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatPercent(value: number | null) {
  return value == null ? '–' : `${value.toFixed(0)}%`;
}

function formatNullablePoints(value: number | null) {
  return value == null ? '–' : formatPoints(value);
}

function formatOdd(value: number | null) {
  return value == null ? '–' : value.toFixed(2);
}

function formatAveragePosition(value: number | null) {
  return value == null ? '–' : value.toFixed(1);
}

function roundCountLabel(count: number) {
  if (count === 1) return '1 kolejka';
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} kolejki`;
  }
  return `${count} kolejek`;
}

function scoreOutcome(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

function outcomeOddForBet(bet: Bet, matchOdd?: MatchOdd) {
  if (!matchOdd) return null;
  const outcome = scoreOutcome(bet.homeScore, bet.awayScore);
  if (outcome === 'home') return matchOdd.homeOdd;
  if (outcome === 'draw') return matchOdd.drawOdd;
  return matchOdd.awayOdd;
}

function betResultKind(bet: Bet, fixture?: Fixture): BetResultKind {
  if (
    !fixture ||
    fixture.status !== 'locked' ||
    fixture.homeScore == null ||
    fixture.awayScore == null
  ) {
    return 'pending';
  }

  if (bet.homeScore === fixture.homeScore && bet.awayScore === fixture.awayScore) {
    return 'exact';
  }

  return scoreOutcome(bet.homeScore, bet.awayScore) === scoreOutcome(fixture.homeScore, fixture.awayScore)
    ? 'outcome'
    : 'miss';
}

function resultLabel(result: BetResultKind) {
  if (result === 'exact') return 'dokładny';
  if (result === 'outcome') return '1X2';
  if (result === 'miss') return 'chybił';
  return 'czeka';
}

function resultClass(result: BetResultKind) {
  if (result === 'exact') return 'bg-green-50 text-green-700 ring-green-100';
  if (result === 'outcome') return 'bg-yellow-50 text-yellow-800 ring-yellow-100';
  if (result === 'miss') return 'bg-red-50 text-red-600 ring-red-100';
  return 'bg-gray-50 text-gray-500 ring-gray-100';
}

function pointClass(row: PlayerHistoryRow) {
  if (row.result === 'exact') return 'text-green-700';
  if (row.result === 'outcome') return 'text-yellow-700';
  if (row.result === 'miss') return 'text-red-500';
  return 'text-gray-300';
}

function rankLabelFromValues(
  playerId: string,
  values: Array<{ playerId: string; value: number | null }>,
  playerCount: number,
) {
  const ranked = values
    .filter((entry): entry is { playerId: string; value: number } => entry.value != null)
    .map((entry) => ({
      ...entry,
      value: Math.round((entry.value + Number.EPSILON) * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value);
  let rank = 0;
  let previousValue: number | null = null;

  for (let index = 0; index < ranked.length; index += 1) {
    const entry = ranked[index];
    if (previousValue == null || entry.value !== previousValue) {
      rank = index + 1;
      previousValue = entry.value;
    }
    if (entry.playerId === playerId) {
      return `${rank}/${playerCount}`;
    }
  }

  return `–/${playerCount}`;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : null;
}

function averageExactRisk(playerBets: Bet[], oddsMap: Map<string, number>) {
  return average(
    playerBets
      .map((bet) => oddsMap.get(`${bet.fixtureId}:${bet.homeScore}:${bet.awayScore}`))
      .filter((odd): odd is number => odd != null && odd > 0),
  );
}

function averageOutcomeRisk(playerBets: Bet[], matchOddsMap: Map<string, MatchOdd>) {
  return average(
    playerBets
      .map((bet) => outcomeOddForBet(bet, matchOddsMap.get(bet.fixtureId)))
      .filter((odd): odd is number => odd != null && odd > 0),
  );
}

function buildHistoryRows({
  bets,
  fixtureMap,
  scoreMap,
  exactOddMap,
  matchOddsMap,
}: {
  bets: Bet[];
  fixtureMap: Map<string, Fixture>;
  scoreMap: Map<string, StoredScoreEntry>;
  exactOddMap: Map<string, number>;
  matchOddsMap: Map<string, MatchOdd>;
}) {
  return [...bets]
    .map((bet): PlayerHistoryRow => {
      const fixture = fixtureMap.get(bet.fixtureId);
      const score = scoreMap.get(bet.fixtureId);
      const exactOdd = exactOddMap.get(`${bet.fixtureId}:${bet.homeScore}:${bet.awayScore}`) ?? null;
      const outcomeOdd = outcomeOddForBet(bet, matchOddsMap.get(bet.fixtureId));
      const result = betResultKind(bet, fixture);
      const error =
        fixture?.status === 'locked' && fixture.homeScore != null && fixture.awayScore != null
          ? Math.abs(bet.homeScore - fixture.homeScore) + Math.abs(bet.awayScore - fixture.awayScore)
          : null;

      return {
        id: String(bet.id ?? `${bet.playerId}:${bet.fixtureId}`),
        bet,
        fixture,
        score,
        result,
        points: score?.points ?? 0,
        exactOdd,
        outcomeOdd: outcomeOdd != null && outcomeOdd > 0 ? outcomeOdd : null,
        error,
      };
    })
    .sort((a, b) => {
      if (a.fixture && b.fixture) return compareFixturesByKickoff(b.fixture, a.fixture);
      if (a.fixture) return -1;
      if (b.fixture) return 1;
      return (b.bet.updatedAt ?? 0) - (a.bet.updatedAt ?? 0);
    });
}

function fullFormForPlayer(
  lockedFixtures: Fixture[],
  betByFixtureId: Map<string, Bet>,
  scoreMap: Map<string, StoredScoreEntry>,
): LeaderboardFormEntry[] {
  return lockedFixtures.map((fixture) => {
    const bet = betByFixtureId.get(fixture.id);
    const score = scoreMap.get(fixture.id);
    return {
      fixture,
      result: score?.pointType === 'outcome' ? 'outcome' : score ? 'exact' : bet ? 'miss' : 'none',
      points: score?.points ?? 0,
      betHomeScore: bet?.homeScore ?? score?.betHomeScore,
      betAwayScore: bet?.awayScore ?? score?.betAwayScore,
    };
  });
}

function findSimilarPair(playerId: string, leaderboard: LeaderboardData): LeaderboardSimilarPair | undefined {
  return leaderboard.socialStats.similarPairs.find((pair) =>
    pair.players.some((pairPlayer) => pairPlayer.id === playerId),
  );
}

function buildTimelineRankStats(playerId: string, leaderboard: LeaderboardData) {
  const positions = leaderboard.timeline
    .filter((point) => point.fixture.status === 'locked')
    .filter((point) => Object.values(point.totalsByPlayerId).some((total) => total > 0))
    .map((point) => {
      const ranked = leaderboard.board
        .map((row) => ({
          playerId: row.player.id,
          name: row.player.name,
          total: point.totalsByPlayerId[row.player.id] ?? 0,
        }))
        .sort((a, b) => {
          if (b.total !== a.total) return b.total - a.total;
          return a.name.localeCompare(b.name, 'pl-PL');
        });

      let position = 0;
      let previousTotal: number | null = null;

      for (let index = 0; index < ranked.length; index += 1) {
        const entry = ranked[index];
        if (previousTotal == null || entry.total !== previousTotal) {
          position = index + 1;
          previousTotal = entry.total;
        }
        if (entry.playerId === playerId) {
          return position;
        }
      }

      return null;
    })
    .filter((position): position is number => position != null);

  return {
    averagePosition: average(positions),
    leaderCount: positions.filter((position) => position === 1).length,
    top3Count: positions.filter((position) => position <= 3).length,
    sampleCount: positions.length,
  };
}

function buildPlayerFormRuns(
  entries: LeaderboardFormEntry[],
  predicate: (entry: LeaderboardFormEntry) => boolean,
  isNeutral?: (entry: LeaderboardFormEntry) => boolean,
) {
  const runs: PlayerFormRun[] = [];
  let current: LeaderboardFormEntry[] = [];

  const saveCurrent = () => {
    if (current.length === 0) return;
    runs.push({
      entries: current,
      points: current.reduce((acc, entry) => acc + entry.points, 0),
    });
  };

  for (const entry of entries) {
    if (predicate(entry)) {
      current = [...current, entry];
    } else if (!isNeutral?.(entry)) {
      saveCurrent();
      current = [];
    }
  }

  saveCurrent();
  return runs;
}

function compareFormRunsByLength(a: PlayerFormRun, b: PlayerFormRun) {
  if (b.entries.length !== a.entries.length) return b.entries.length - a.entries.length;
  if (b.points !== a.points) return b.points - a.points;

  const aLastFixture = a.entries.at(-1)?.fixture;
  const bLastFixture = b.entries.at(-1)?.fixture;
  if (aLastFixture && bLastFixture) return compareFixturesByKickoff(bLastFixture, aLastFixture);
  return 0;
}

function compareFormRunsByPoints(a: PlayerFormRun, b: PlayerFormRun) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.entries.length !== a.entries.length) return b.entries.length - a.entries.length;

  const aLastFixture = a.entries.at(-1)?.fixture;
  const bLastFixture = b.entries.at(-1)?.fixture;
  if (aLastFixture && bLastFixture) return compareFixturesByKickoff(bLastFixture, aLastFixture);
  return 0;
}

function pointRunRangeLabel(run?: PlayerFormRun) {
  const firstFixture = run?.entries[0]?.fixture;
  const lastFixture = run?.entries.at(-1)?.fixture;
  if (!firstFixture || !lastFixture) return 'brak danych';
  if (firstFixture.id === lastFixture.id) return shortDate(firstFixture.date);
  return `${shortDate(firstFixture.date)} – ${shortDate(lastFixture.date)}`;
}

function PlayerTitle({
  player,
  leaderIds,
}: {
  player: Player;
  leaderIds: ReadonlySet<string>;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <PlayerOnlineStatusDot lastOnlineAt={player.lastOnlineAt} />
      <span className="truncate">{formatPlayerName(player, leaderIds)}</span>
    </span>
  );
}

function MiniFormStat({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: ReactNode;
  tone?: 'gray' | 'green' | 'yellow' | 'red';
}) {
  const valueClass =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'yellow'
      ? 'text-yellow-800'
      : tone === 'red'
      ? 'text-red-600'
      : 'text-gray-900';

  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2">
      <div className="truncate text-gray-400">{label}</div>
      <div className={`font-mono text-sm font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  rankLabel,
  tone = 'gray',
  tooltip,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  rankLabel?: string;
  tone?: 'gray' | 'green' | 'yellow' | 'red' | 'blue';
  tooltip?: ReactNode;
}) {
  const toneClass =
    tone === 'green'
      ? 'border-green-100 bg-green-50/70'
      : tone === 'yellow'
      ? 'border-yellow-100 bg-yellow-50/70'
      : tone === 'red'
      ? 'border-red-100 bg-red-50/70'
      : tone === 'blue'
      ? 'border-blue-100 bg-blue-50/70'
      : 'border-gray-200 bg-gray-50';

  return (
    <div className={`relative min-w-0 rounded-lg border px-3 py-3 ${toneClass}`}>
      {rankLabel && (
        <span className="absolute right-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-black/5">
          {rankLabel}
        </span>
      )}
      <div className="flex min-w-0 items-center gap-1 pr-12 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span className="truncate">{label}</span>
        {tooltip && (
          <Tooltip content={tooltip}>
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] text-gray-500">
              ?
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 truncate text-lg font-bold text-gray-950">{value}</div>
      {detail && <div className="mt-1 min-h-4 text-xs leading-snug text-gray-500">{detail}</div>}
    </div>
  );
}

function InsightCard({
  label,
  value,
  detail,
  tone = 'gray',
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: 'gray' | 'green' | 'yellow' | 'red' | 'blue';
}) {
  const valueClass =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'yellow'
      ? 'text-yellow-800'
      : tone === 'red'
      ? 'text-red-600'
      : tone === 'blue'
      ? 'text-blue-700'
      : 'text-gray-950';

  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 truncate text-sm font-bold ${valueClass}`}>{value}</div>
      <div className="mt-1 text-xs leading-snug text-gray-500">{detail}</div>
    </div>
  );
}

function ResultPill({ result }: { result: BetResultKind }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${resultClass(result)}`}>
      {resultLabel(result)}
    </span>
  );
}

function ProgressMeter({ value }: { value: number | null }) {
  const width = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full bg-green-600" style={{ width: `${width}%` }} />
    </div>
  );
}

function HistoryDesktopTable({ rows }: { rows: PlayerHistoryRow[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500">
            <th className="px-3 py-2 text-left">Mecz</th>
            <th className="px-3 py-2 text-center">Typ</th>
            <th className="px-3 py-2 text-center">Wynik</th>
            <th className="px-3 py-2 text-center">Status</th>
            <th className="px-3 py-2 text-right">Kursy</th>
            <th className="px-3 py-2 text-right">Punkty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-3 py-2.5 text-gray-700">
                <div className="font-semibold text-gray-900">
                  {row.fixture ? fixtureTeamsLabel(row.fixture) : 'Mecz'}
                </div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {row.fixture ? shortDate(row.fixture.date) : 'brak daty'}
                </div>
              </td>
              <td className="px-3 py-2.5 text-center font-mono font-bold text-gray-900">
                {row.bet.homeScore}:{row.bet.awayScore}
              </td>
              <td className="px-3 py-2.5 text-center font-mono font-semibold">
                {row.fixture?.status === 'locked' && row.fixture.homeScore != null && row.fixture.awayScore != null ? (
                  <span className="text-gray-900">
                    {row.fixture.homeScore}:{row.fixture.awayScore}
                  </span>
                ) : (
                  <span className="text-gray-300">–</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-center">
                <ResultPill result={row.result} />
              </td>
              <td className="px-3 py-2.5 text-right text-xs text-gray-500">
                <div>dokł. <span className="font-mono font-semibold text-gray-700">{formatOdd(row.exactOdd)}</span></div>
                <div>1X2 <span className="font-mono font-semibold text-gray-700">{formatOdd(row.outcomeOdd)}</span></div>
              </td>
              <td className={`px-3 py-2.5 text-right font-bold ${pointClass(row)}`}>
                {row.score ? `+${formatPoints(row.points)}` : row.result === 'miss' ? '0.00' : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryMobileList({ rows }: { rows: PlayerHistoryRow[] }) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-gray-200 bg-white px-3 py-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">
                {row.fixture ? fixtureTeamsLabel(row.fixture) : 'Mecz'}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {row.fixture ? shortDate(row.fixture.date) : 'brak daty'}
              </div>
            </div>
            <ResultPill result={row.result} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Typ</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-gray-900">
                {row.bet.homeScore}:{row.bet.awayScore}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Wynik</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-gray-900">
                {row.fixture?.status === 'locked' && row.fixture.homeScore != null && row.fixture.awayScore != null
                  ? `${row.fixture.homeScore}:${row.fixture.awayScore}`
                  : '–'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Punkty</div>
              <div className={`mt-0.5 text-sm font-bold ${pointClass(row)}`}>
                {row.score ? `+${formatPoints(row.points)}` : row.result === 'miss' ? '0.00' : '–'}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>dokł. <span className="font-mono font-semibold text-gray-700">{formatOdd(row.exactOdd)}</span></span>
            <span>1X2 <span className="font-mono font-semibold text-gray-700">{formatOdd(row.outcomeOdd)}</span></span>
            {row.error != null && row.result === 'miss' && (
              <span>błąd <span className="font-mono font-semibold text-red-600">{row.error}</span></span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlayerHistoryShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[94vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-5xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <div className="min-w-0 text-lg font-bold text-gray-950 sm:text-xl">{title}</div>
            <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Zamknij profil gracza"
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(94vh-73px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export function PlayerHistory({ player, onClose }: { player: Player; onClose: () => void }) {
  const currentPlayer = useLiveQuery(() => db.players.get(player.id), [player.id]);
  const bets = useLiveQuery(() => db.bets.where('playerId').equals(player.id).toArray(), [player.id]);
  const allBets = useLiveQuery(() => db.bets.toArray(), []);
  const fixtures = useLiveQuery(() => db.fixtures.orderBy('date').toArray(), []);
  const scores = useLiveQuery(() => db.scores.where('playerId').equals(player.id).toArray(), [player.id]);
  const odds = useLiveQuery(() => db.odds.toArray(), []);
  const matchOdds = useLiveQuery(() => db.matchOdds.toArray(), []);
  const leaderboard = useLiveQuery(() => getLeaderboardData(), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const displayedPlayer = currentPlayer ?? player;

  if (!bets || !allBets || !fixtures || !scores || !odds || !matchOdds || !leaderboard) {
    return (
      <PlayerHistoryShell
        title={`Profil gracza: ${displayedPlayer.name}`}
        subtitle="Ładowanie danych profilu..."
        onClose={onClose}
      >
        <div className="py-12 text-center text-sm text-gray-400">Ładowanie…</div>
      </PlayerHistoryShell>
    );
  }

  const leaderIds = leaderIdsFromRows(leaderboard.board);
  const leaderboardRow = leaderboard.board.find((row) => row.player.id === player.id);
  const rankLabel = leaderboardRow
    ? `${leaderboardRow.currentPosition}/${leaderboard.board.length}`
    : `–/${leaderboard.board.length}`;
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const scoreMap = new Map(scores.map((score) => [score.fixtureId, score as StoredScoreEntry]));
  const exactOddMap = new Map(
    (odds as Odd[])
      .filter((odd) => odd.odd > 0)
      .map((odd) => [`${odd.fixtureId}:${odd.homeScore}:${odd.awayScore}`, odd.odd]),
  );
  const matchOddsMap = new Map((matchOdds as MatchOdd[]).map((odd) => [odd.fixtureId, odd]));
  const historyRows = buildHistoryRows({
    bets,
    fixtureMap,
    scoreMap,
    exactOddMap,
    matchOddsMap,
  });
  const lockedFixtures = fixtures
    .filter((fixture) => fixture.status === 'locked')
    .sort(compareFixturesByKickoff);
  const lockedFixtureIds = new Set(lockedFixtures.map((fixture) => fixture.id));
  const betByFixtureId = new Map(bets.map((bet) => [bet.fixtureId, bet]));
  const fullForm = fullFormForPlayer(lockedFixtures, betByFixtureId, scoreMap);
  const pointRuns = buildPlayerFormRuns(
    fullForm,
    (entry) => entry.result === 'exact' || entry.result === 'outcome',
  );
  const exactRuns = buildPlayerFormRuns(fullForm, (entry) => entry.result === 'exact');
  const missRuns = buildPlayerFormRuns(
    fullForm,
    (entry) => entry.result === 'miss',
    (entry) => entry.result === 'none',
  );
  const recentForm = leaderboardRow?.recentForm ?? [...fullForm].slice(-5).reverse();
  const completedBets = historyRows.filter((row) => row.fixture?.status === 'locked');
  const scoreCount = scores.length;
  const totalPoints = leaderboardRow?.total ?? scores.reduce((acc, score) => acc + score.points, 0);
  const exactHits = leaderboardRow?.exactHits ?? scores.filter((score) => score.pointType !== 'outcome').length;
  const outcomeHits = leaderboardRow?.outcomeHits ?? scores.filter((score) => score.pointType === 'outcome').length;
  const missedBets = completedBets.filter((row) => row.result === 'miss');
  const avgPoints = completedBets.length > 0 ? totalPoints / completedBets.length : null;
  const effectiveness = completedBets.length > 0 ? (scoreCount / completedBets.length) * 100 : null;
  const coverage = lockedFixtures.length > 0 ? (completedBets.length / lockedFixtures.length) * 100 : null;
  const missingLockedBets = lockedFixtures.filter((fixture) => !betByFixtureId.has(fixture.id)).length;
  const exactRisk = averageExactRisk(bets, exactOddMap);
  const outcomeRisk = averageOutcomeRisk(bets, matchOddsMap);
  const exactRiskSamples = historyRows.filter((row) => row.exactOdd != null).length;
  const outcomeRiskSamples = historyRows.filter((row) => row.outcomeOdd != null).length;
  const bestScore = [...scores].sort((a, b) => b.points - a.points)[0] as StoredScoreEntry | undefined;
  const bestFixture = bestScore ? fixtureMap.get(bestScore.fixtureId) : undefined;
  const worstMiss = [...missedBets]
    .filter((row) => row.error != null)
    .sort((a, b) => (b.error ?? 0) - (a.error ?? 0) || (b.exactOdd ?? 0) - (a.exactOdd ?? 0))[0];
  const bestAlmost = historyRows
    .filter((row) => row.error === 1 && row.result === 'miss')
    .sort((a, b) => (b.exactOdd ?? 0) - (a.exactOdd ?? 0))[0];
  const rankStats = buildTimelineRankStats(player.id, leaderboard);
  const longestPointRun = [...pointRuns].sort(compareFormRunsByLength)[0];
  const longestExactRun = [...exactRuns].sort(compareFormRunsByLength)[0];
  const longestMissRun = [...missRuns].sort(compareFormRunsByLength)[0];
  const topScoringPointRun = [...pointRuns].sort(compareFormRunsByPoints)[0];
  const contrarianRow = leaderboard.socialStats.contrarianRows.find((row) => row.player.id === player.id);
  const similarPair = findSimilarPair(player.id, leaderboard);
  const similarPartner = similarPair?.players.find((pairPlayer) => pairPlayer.id !== player.id);
  const betsByPlayerId = new Map<string, Bet[]>();
  for (const bet of allBets) {
    const playerBets = betsByPlayerId.get(bet.playerId) ?? [];
    playerBets.push(bet);
    betsByPlayerId.set(bet.playerId, playerBets);
  }
  const completedBetCountForPlayer = (playerId: string) =>
    (betsByPlayerId.get(playerId) ?? []).filter((bet) => lockedFixtureIds.has(bet.fixtureId)).length;
  const avgPointsRank = rankLabelFromValues(
    player.id,
    leaderboard.board.map((row) => {
      const completedCount = completedBetCountForPlayer(row.player.id);
      return {
        playerId: row.player.id,
        value: completedCount > 0 ? row.total / completedCount : null,
      };
    }),
    leaderboard.board.length,
  );
  const hitRateRank = rankLabelFromValues(
    player.id,
    leaderboard.board.map((row) => {
      const completedCount = completedBetCountForPlayer(row.player.id);
      return {
        playerId: row.player.id,
        value: completedCount > 0 ? (row.history.length / completedCount) * 100 : null,
      };
    }),
    leaderboard.board.length,
  );
  const riskRankLabel = rankLabelFromValues(
    player.id,
    leaderboard.board.map((row) => ({
      playerId: row.player.id,
      value: averageExactRisk(betsByPlayerId.get(row.player.id) ?? [], exactOddMap),
    })),
    leaderboard.board.length,
  );

  return (
    <PlayerHistoryShell
      title={<PlayerTitle player={displayedPlayer} leaderIds={leaderIds} />}
      subtitle={`Ostatnio online: ${formatLastOnline(displayedPlayer.lastOnlineAt)}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricTile
              label="Punkty"
              value={`${formatPoints(totalPoints)} pkt`}
              detail={`${completedBets.length} obstawień`}
              rankLabel={rankLabel}
              tone="green"
            />
            <MetricTile
              label="Śr. pkt/mecz"
              value={formatNullablePoints(avgPoints)}
              detail={`${completedBets.length} obstawień`}
              rankLabel={avgPointsRank}
            />
            <MetricTile
              label="Skuteczność"
              value={formatPercent(effectiveness)}
              detail={`${scoreCount}/${completedBets.length} punktowanych`}
              rankLabel={hitRateRank}
              tone="yellow"
            />
            <MetricTile
              label="Trafienia"
              value={`${exactHits} · ${outcomeHits}`}
              detail="Dokładne · 1X2"
            />
            <MetricTile
              label="Średnie ryzyko"
              value={`D ${formatOdd(exactRisk)} · W ${formatOdd(outcomeRisk)}`}
              detail={`${exactRiskSamples} obstawień`}
              rankLabel={riskRankLabel}
              tooltip="Średni kurs typowanych wyników i rozstrzygnięć. Ranking liczony jest po kursie dokładnego wyniku: wyższy kurs oznacza wyższe ryzyko."
            />
            <MetricTile
              label="Kompletność"
              value={formatPercent(coverage)}
              detail={`${completedBets.length}/${lockedFixtures.length} zakończonych meczów`}
              tone={missingLockedBets > 0 ? 'red' : 'blue'}
            />
            <MetricTile
              label="Śr. miejsce"
              value={formatAveragePosition(rankStats.averagePosition)}
              detail={`po ${roundCountLabel(rankStats.sampleCount)} z punktami`}
              tooltip="Średnia pozycja po zakończonych meczach, w których tabela miała już przynajmniej jednego punktującego gracza."
            />
            <MetricTile
              label="Jako lider"
              value={rankStats.leaderCount}
              detail={`z ${roundCountLabel(rankStats.sampleCount)}`}
              tone="green"
            />
            <MetricTile
              label="W top3"
              value={rankStats.top3Count}
              detail={`z ${roundCountLabel(rankStats.sampleCount)}`}
              tone="blue"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Forma</h3>
                <div className="mt-2">
                  <FormDots entries={recentForm} />
                </div>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                {matchCountLabel(fullForm.length)}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>Pokrycie zakończonych meczów</span>
                  <span className="font-mono font-semibold">{formatPercent(coverage)}</span>
                </div>
                <ProgressMeter value={coverage} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <MiniFormStat
                  label="Najdł. punktowa"
                  value={longestPointRun?.entries.length ?? 0}
                  tone="green"
                />
                <MiniFormStat
                  label="Najdł. dokładne"
                  value={longestExactRun?.entries.length ?? 0}
                  tone="green"
                />
                <MiniFormStat label="Pominięte" value={missingLockedBets} />
                <MiniFormStat
                  label="Najdł. pudła"
                  value={longestMissRun?.entries.length ?? 0}
                  tone="red"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <InsightCard
            label="Najlepszy strzał"
            value={bestScore ? `+${formatPoints(bestScore.points)} pkt` : 'brak'}
            detail={
              bestScore && bestFixture
                ? `${bestScore.pointType === 'outcome' ? '1X2' : 'dokładny'} · ${fixtureScoreLabel(bestFixture)}`
                : 'Jeszcze bez punktowanego typu.'
            }
            tone="green"
          />
          <InsightCard
            label="Najwyższy kurs minięty o 1 bramkę"
            value={bestAlmost ? formatOdd(bestAlmost.exactOdd) : 'brak'}
            detail={
              bestAlmost?.fixture
                ? `typ ${bestAlmost.bet.homeScore}:${bestAlmost.bet.awayScore} · ${fixtureScoreLabel(bestAlmost.fixture)}`
                : 'Brak pudła o jedną bramkę.'
            }
            tone="yellow"
          />
          <InsightCard
            label="Najdłuższa seria punktowa"
            value={longestPointRun ? <FormDots entries={longestPointRun.entries} /> : 'brak'}
            detail={
              longestPointRun
                ? `${matchCountLabel(longestPointRun.entries.length)} · ${formatPoints(longestPointRun.points)} pkt · ${pointRunRangeLabel(longestPointRun)}`
                : 'Brak serii z punktami.'
            }
            tone="green"
          />
          <InsightCard
            label="Najbardziej punktowana seria"
            value={topScoringPointRun ? <FormDots entries={topScoringPointRun.entries} /> : 'brak'}
            detail={
              topScoringPointRun
                ? `${formatPoints(topScoringPointRun.points)} pkt · ${matchCountLabel(topScoringPointRun.entries.length)} · ${pointRunRangeLabel(topScoringPointRun)}`
                : 'Brak serii z punktami.'
            }
            tone="green"
          />
          <InsightCard
            label="Pod prąd"
            value={contrarianRow ? `${contrarianRow.againstCount} razy` : 'brak'}
            detail={
              contrarianRow
                ? `${contrarianRow.hitCount} trafień, ${formatPoints(contrarianRow.points)} pkt przeciw większości`
                : 'Brak jednoznacznych typów przeciw tłumowi.'
            }
            tone="blue"
          />
          <InsightCard
            label="Najbliższy styl"
            value={similarPair && similarPartner ? formatPlayerName(similarPartner, leaderIds) : 'brak'}
            detail={
              similarPair
                ? `${similarPair.similarity.toFixed(0)}% zgodności, ${similarPair.sharedBetCount} wspólnych typów`
                : 'Za mało wspólnych typów z innymi graczami.'
            }
          />
        </div>

        {worstMiss && (
          <div className="rounded-lg border border-red-100 bg-red-50/60 px-4 py-3 text-sm">
            <div className="font-semibold text-red-700">Największe pudło</div>
            <div className="mt-1 text-gray-700">
              {worstMiss.fixture ? fixtureScoreLabel(worstMiss.fixture) : 'Mecz'} · typ{' '}
              <span className="font-mono font-bold text-red-700">
                {worstMiss.bet.homeScore}:{worstMiss.bet.awayScore}
              </span>{' '}
              · błąd <span className="font-mono font-bold text-red-700">{worstMiss.error}</span>
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Historia typów</h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
              {historyRows.length}
            </span>
          </div>
          {historyRows.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
              Brak zakładów.
            </p>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white md:overflow-hidden">
              <HistoryDesktopTable rows={historyRows} />
              <div className="p-2 md:hidden">
                <HistoryMobileList rows={historyRows} />
              </div>
            </div>
          )}
        </div>
      </div>
    </PlayerHistoryShell>
  );
}
