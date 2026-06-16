import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Player, ScoreEntry } from '../db';
import type { LeaderboardData, LeaderboardRow, LeaderboardTimelinePoint } from '../utils/scoring';
import { displayTeamName } from '../utils/displayNames';
import { formatPlayerName } from '../utils/playerNames';

const PLAYER_COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#7c3aed',
  '#f97316',
  '#0891b2',
  '#be123c',
  '#65a30d',
  '#475569',
  '#a16207',
  '#0f766e',
  '#c026d3',
];
const PLAYBACK_MS = 900;

type PlayerDataKey = `player_${number}`;

interface PlayerSeries {
  id: string;
  key: PlayerDataKey;
  player: Player;
  name: string;
  color: string;
}

interface ChartDatum {
  index: number;
  matchNumber: number;
  fixtureId: string;
  fixtureName: string;
  dateLabel: string;
  resultLabel: string;
  round: string;
  hasOdds: boolean;
  hasResult: boolean;
  [key: PlayerDataKey]: number | null;
}

interface RankingSnapshotRow {
  player: Player;
  name: string;
  color: string;
  total: number;
  exactHits: number;
  outcomeHits: number;
  position: number;
  previousPosition: number | null;
}

interface MatchEvent {
  player: Player;
  name: string;
  color: string;
  points: number;
  score?: ScoreEntry & { id?: number };
}

interface MatchEventGroup {
  id: string;
  points: number;
  events: MatchEvent[];
  exactCount: number;
  outcomeCount: number;
}

interface LeaderboardProgressChartProps {
  data: LeaderboardData['timeline'];
  rows: LeaderboardRow[];
  leaderIds: ReadonlySet<string>;
  currentPlayerId?: string;
}

function formatPoints(value: number) {
  return value.toFixed(2);
}

function shortDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  });
}

function fixtureName(fixture: LeaderboardTimelinePoint['fixture']) {
  return `${displayTeamName(fixture.homeTeam)} - ${displayTeamName(fixture.awayTeam)}`;
}

function fixtureResultLabel(fixture: LeaderboardTimelinePoint['fixture']) {
  if (fixture.homeScore == null || fixture.awayScore == null) {
    return fixtureName(fixture);
  }

  return `${displayTeamName(fixture.homeTeam)} ${fixture.homeScore}:${fixture.awayScore} ${displayTeamName(fixture.awayTeam)}`;
}

function toNumericIndex(value: number | string | null | undefined) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function valueFromDatum(datum: ChartDatum, key: PlayerDataKey) {
  const value = datum[key];
  return typeof value === 'number' ? value : null;
}

function playerInitial(player: Player) {
  return (player.name.trim()[0] ?? '?').toLocaleUpperCase('pl-PL');
}

function getPayloadDatum(payload: unknown) {
  if (!Array.isArray(payload)) return null;
  const [firstEntry] = payload;
  if (typeof firstEntry !== 'object' || firstEntry == null || !('payload' in firstEntry)) {
    return null;
  }

  const candidate = firstEntry.payload;
  if (
    typeof candidate === 'object' &&
    candidate != null &&
    'fixtureId' in candidate &&
    'index' in candidate
  ) {
    return candidate as ChartDatum;
  }
  return null;
}

function buildRankingSnapshot(
  selectedIndex: number,
  rows: LeaderboardRow[],
  players: PlayerSeries[],
  points: LeaderboardData['timeline'],
  fixtureIndexById: Map<string, number>,
  previousPositionByPlayerId?: Map<string, number>,
): RankingSnapshotRow[] {
  const point = points[selectedIndex];
  if (!point) return [];

  const rowsByPlayerId = new Map(rows.map((row) => [row.player.id, row]));
  const sortedRows = players
    .map((series) => {
      const row = rowsByPlayerId.get(series.id);
      let exactHits = 0;
      let outcomeHits = 0;

      for (const score of row?.history ?? []) {
        const fixtureIndex = fixtureIndexById.get(score.fixtureId);
        if (fixtureIndex == null || fixtureIndex > selectedIndex) continue;
        if (score.pointType === 'outcome') {
          outcomeHits += 1;
        } else {
          exactHits += 1;
        }
      }

      return {
        player: series.player,
        name: series.name,
        color: series.color,
        total: point.totalsByPlayerId[series.id] ?? 0,
        exactHits,
        outcomeHits,
      };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
      if (b.outcomeHits !== a.outcomeHits) return b.outcomeHits - a.outcomeHits;
      return a.player.name.localeCompare(b.player.name, 'pl-PL');
    });

  let position = 0;
  let previousTotal: number | null = null;
  return sortedRows.map((row, index) => {
    if (previousTotal == null || row.total !== previousTotal) {
      position = index + 1;
      previousTotal = row.total;
    }

    return {
      ...row,
      position,
      previousPosition: previousPositionByPlayerId?.get(row.player.id) ?? null,
    };
  });
}

function rankDeltaLabel(entry: RankingSnapshotRow) {
  if (entry.previousPosition == null) return null;
  const delta = entry.previousPosition - entry.position;
  if (delta > 0) return <span className="text-green-600">↑{delta}</span>;
  if (delta < 0) return <span className="text-red-500">↓{Math.abs(delta)}</span>;
  return <span className="text-gray-300">-</span>;
}

function groupMatchEvents(events: MatchEvent[]): MatchEventGroup[] {
  const groups = new Map<string, MatchEventGroup>();
  for (const event of events) {
    const key = formatPoints(event.points);
    const group = groups.get(key) ?? {
      id: key,
      points: event.points,
      events: [],
      exactCount: 0,
      outcomeCount: 0,
    };

    group.events.push(event);
    if (event.score?.pointType === 'outcome') {
      group.outcomeCount += 1;
    } else {
      group.exactCount += 1;
    }
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => b.points - a.points);
}

function eventGroupMeta(group: MatchEventGroup) {
  if (group.exactCount > 0 && group.outcomeCount > 0) return 'dokładny wynik + 1X2';
  if (group.outcomeCount > 0) return '1X2';
  return 'dokładny wynik';
}

function renderEndpointDot(player: PlayerSeries, endpointIndex: number) {
  return function EndpointDot({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) {
    if (index !== endpointIndex || typeof cx !== 'number' || typeof cy !== 'number') {
      return <g />;
    }

    return (
      <g pointerEvents="none">
        <circle cx={cx} cy={cy} r={8} fill={player.color} stroke="white" strokeWidth={2} />
        <text
          x={cx}
          y={cy + 0.5}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white text-[9px] font-bold"
        >
          {playerInitial(player.player)}
        </text>
      </g>
    );
  };
}

function ProgressTooltip({
  active,
  payload,
  players,
  points,
}: {
  active?: boolean;
  payload?: unknown;
  players: PlayerSeries[];
  points: LeaderboardData['timeline'];
}) {
  const datum = getPayloadDatum(payload);
  if (!active || !datum) return null;

  const point = points[datum.index];
  const topGainers = players
    .map((player) => ({
      player,
      points: point?.pointsByPlayerId[player.id] ?? 0,
      total: valueFromDatum(datum, player.key) ?? 0,
    }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 4);

  const leaders = players
    .map((player) => ({
      player,
      total: valueFromDatum(datum, player.key) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  return (
    <div className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-3 text-xs shadow-xl">
      <div className="font-semibold text-gray-900">{datum.resultLabel}</div>
      <div className="mt-0.5 text-gray-400">
        Mecz {datum.matchNumber} · {datum.dateLabel} · {datum.round}
      </div>
      {topGainers.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {topGainers.map((entry) => (
            <div key={entry.player.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-gray-600">
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.player.color }}
                />
                {entry.player.name}
              </span>
              <span className="font-semibold text-green-700">
                +{formatPoints(entry.points)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-gray-400">
          {datum.hasResult ? 'Nikt nie punktował w tym meczu.' : 'Czeka na wynik.'}
        </div>
      )}
      <div className="mt-3 border-t border-gray-100 pt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Liderzy po meczu
        </div>
        <div className="space-y-1">
          {leaders.map((entry, index) => (
            <div key={entry.player.id} className="flex items-center justify-between gap-3 text-gray-600">
              <span className="min-w-0 truncate">
                {index + 1}. {entry.player.name}
              </span>
              <span className="font-mono font-semibold text-gray-800">
                {formatPoints(entry.total)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeaderboardProgressChart({
  data,
  rows,
  leaderIds,
  currentPlayerId,
}: LeaderboardProgressChartProps) {
  const players = useMemo<PlayerSeries[]>(
    () =>
      rows.map((row, index) => ({
        id: row.player.id,
        key: `player_${index}`,
        player: row.player,
        name: formatPlayerName(row.player, leaderIds),
        color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      })),
    [leaderIds, rows],
  );
  const lastKnownIndex = data.reduce(
    (result, point, index) => (point.fixture.status === 'locked' ? index : result),
    -1,
  );
  const defaultIndex = data.length === 0 ? 0 : Math.max(0, lastKnownIndex);
  const [selectedIndexOverride, setSelectedIndexOverride] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const selectedIndex = selectedIndexOverride ?? defaultIndex;
  const boundedSelectedIndex = Math.min(selectedIndex, Math.max(data.length - 1, 0));
  const selectedPoint = data[boundedSelectedIndex];
  const firstPoint = data[0];
  const lastPoint = data.at(-1);
  const playbackEndIndex = Math.max(defaultIndex, 0);
  const fixtureIndexById = useMemo(
    () => new Map(data.map((point, index) => [point.fixture.id, index])),
    [data],
  );
  const previousRanking = useMemo(
    () =>
      boundedSelectedIndex > 0
        ? buildRankingSnapshot(
            boundedSelectedIndex - 1,
            rows,
            players,
            data,
            fixtureIndexById,
          )
        : [],
    [boundedSelectedIndex, data, fixtureIndexById, players, rows],
  );
  const previousPositionByPlayerId = useMemo(
    () => new Map(previousRanking.map((entry) => [entry.player.id, entry.position])),
    [previousRanking],
  );
  const rankingSnapshot = useMemo(
    () =>
      buildRankingSnapshot(
        boundedSelectedIndex,
        rows,
        players,
        data,
        fixtureIndexById,
        previousPositionByPlayerId,
      ),
    [boundedSelectedIndex, data, fixtureIndexById, players, previousPositionByPlayerId, rows],
  );
  const chartData = useMemo<ChartDatum[]>(
    () =>
      data.map((point, index) => {
        const datum: ChartDatum = {
          index,
          matchNumber: point.matchNumber,
          fixtureId: point.fixture.id,
          fixtureName: fixtureName(point.fixture),
          dateLabel: shortDate(point.fixture.date),
          resultLabel: fixtureResultLabel(point.fixture),
          round: point.fixture.round,
          hasOdds: point.hasOdds,
          hasResult: point.fixture.status === 'locked',
        };

        for (const player of players) {
          datum[player.key] =
            index <= boundedSelectedIndex ? point.totalsByPlayerId[player.id] ?? 0 : null;
        }

        return datum;
      }),
    [boundedSelectedIndex, data, players],
  );
  const selectedEvents = useMemo<MatchEvent[]>(() => {
    if (!selectedPoint) return [];
    return players
      .map((player) => {
        const row = rows.find((entry) => entry.player.id === player.id);
        const points = selectedPoint.pointsByPlayerId[player.id] ?? 0;
        return {
          player: player.player,
          name: player.name,
          color: player.color,
          points,
          score: row?.history.find((score) => score.fixtureId === selectedPoint.fixture.id),
        };
      })
      .filter((event) => event.points > 0)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.player.name.localeCompare(b.player.name, 'pl-PL');
      });
  }, [players, rows, selectedPoint]);
  const selectedEventGroups = useMemo(() => groupMatchEvents(selectedEvents), [selectedEvents]);

  const isPlaybackActive = isPlaying && boundedSelectedIndex < playbackEndIndex;
  useEffect(() => {
    if (!isPlaybackActive || data.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      setSelectedIndexOverride(Math.min(boundedSelectedIndex + 1, playbackEndIndex));
    }, PLAYBACK_MS);

    return () => window.clearTimeout(timeoutId);
  }, [boundedSelectedIndex, data.length, isPlaybackActive, playbackEndIndex]);

  if (data.length === 0 || !firstPoint || !lastPoint) {
    return (
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Postęp punktów</h2>
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
          Brak zakończonych meczów i kursów do pokazania na osi czasu.
        </p>
      </div>
    );
  }

  const maxPoints = Math.max(
    1,
    ...data.flatMap((point) => players.map((player) => point.totalsByPlayerId[player.id] ?? 0)),
  );
  const ticks = [
    firstPoint.matchNumber,
    selectedPoint?.matchNumber ?? firstPoint.matchNumber,
    lastPoint.matchNumber,
  ].filter((value, index, all) => all.indexOf(value) === index);
  const selectedRankLeader = rankingSnapshot[0];
  const selectedHasFutureResult = selectedPoint?.fixture.status !== 'locked';
  const selectedRangeLabel = `${shortDate(firstPoint.fixture.date)} - ${shortDate(lastPoint.fixture.date)}`;

  function handleChartClick(state: { activeTooltipIndex?: number | string | null }) {
    const index = toNumericIndex(state.activeTooltipIndex);
    if (index == null || index < 0 || index >= data.length) return;
    setSelectedIndexOverride(index);
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (isPlaybackActive) {
      setIsPlaying(false);
      return;
    }

    setSelectedIndexOverride(boundedSelectedIndex >= playbackEndIndex ? 0 : boundedSelectedIndex);
    setIsPlaying(playbackEndIndex > 0);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Postęp punktów</h2>
          <p className="mt-1 text-xs text-gray-400">
            Zakres: mecz 1 do meczu {lastPoint.matchNumber} z kursami · {selectedRangeLabel}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {data.length} {data.length === 1 ? 'mecz' : 'meczów'}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900">
                  {selectedPoint ? fixtureResultLabel(selectedPoint.fixture) : 'Mecz'}
                </div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {selectedPoint?.fixture.round ?? '-'} · {selectedPoint ? shortDate(selectedPoint.fixture.date) : '-'}
                </div>
              </div>
              {selectedRankLeader && (
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lider</div>
                  <div className="text-sm font-bold text-gray-900">
                    {selectedRankLeader.name}
                    <span className="ml-1 font-mono text-xs text-gray-500">
                      {formatPoints(selectedRankLeader.total)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="h-[300px] min-w-0 sm:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 16, right: 34, bottom: 10, left: -12 }}
                  onClick={handleChartClick}
                >
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                  {lastKnownIndex >= 0 && lastKnownIndex < data.length - 1 && (
                    <ReferenceArea
                      x1={data[lastKnownIndex].matchNumber}
                      x2={lastPoint.matchNumber}
                      fill="#f8fafc"
                      fillOpacity={0.8}
                    />
                  )}
                  <XAxis
                    dataKey="matchNumber"
                    type="number"
                    domain={[firstPoint.matchNumber, lastPoint.matchNumber]}
                    ticks={ticks}
                    tickFormatter={(value) => `M${value}`}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    height={26}
                  />
                  <YAxis
                    width={52}
                    domain={[0, Math.ceil(maxPoints)]}
                    tickFormatter={(value) => formatPoints(Number(value))}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                  />
                  <Tooltip
                    content={(props) => <ProgressTooltip {...props} players={players} points={data} />}
                    cursor={{ stroke: '#111827', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  {selectedPoint && (
                    <ReferenceLine
                      x={selectedPoint.matchNumber}
                      stroke="#111827"
                      strokeDasharray="3 3"
                      strokeWidth={1.5}
                    />
                  )}
                  {players.map((player) => (
                    <Line
                      key={player.id}
                      type="monotone"
                      dataKey={player.key}
                      name={player.name}
                      stroke={player.color}
                      strokeWidth={2.4}
                      dot={renderEndpointDot(player, boundedSelectedIndex)}
                      activeDot={{ r: 4, stroke: '#111827', strokeWidth: 1.5 }}
                      connectNulls={false}
                      isAnimationActive
                      animationDuration={450}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={togglePlayback}
                disabled={playbackEndIndex === 0}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-gray-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {isPlaybackActive ? 'Pauza' : 'Odtwórz'}
              </button>
              <div className="min-w-0 flex-1">
                <input
                  type="range"
                  min={0}
                  max={data.length - 1}
                  value={boundedSelectedIndex}
                  onChange={(event) => {
                    setSelectedIndexOverride(Number(event.target.value));
                    setIsPlaying(false);
                  }}
                  className="h-2 w-full accent-green-700"
                  aria-label="Wybierz mecz na osi historii punktów"
                />
                <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  <span>Mecz 1</span>
                  <span>Mecz {lastPoint.matchNumber}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-gray-100 pt-3 text-xs">
              {players.map((player) => (
                <span key={player.id} className="inline-flex min-w-0 items-center gap-1.5 text-gray-600">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="max-w-36 truncate sm:max-w-44">
                    {player.name}
                    {player.id === currentPlayerId && (
                      <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
                        ty
                      </span>
                    )}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <aside className="border-t-4 border-gray-100 bg-gray-50 p-3 sm:p-4 md:border-l md:border-t-0 md:bg-white">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Ostatni mecz
              </div>

              <div className="mt-3 space-y-2">
                {selectedEventGroups.length > 0 ? (
                  selectedEventGroups.map((group) => (
                    <div key={group.id} className="border-b border-gray-200 pb-2.5 pt-2.5 first:pt-0 last:border-b-0 last:pb-0 md:border-gray-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-snug text-gray-900">
                            {group.events.map((event, index) => (
                              <span key={event.player.id}>
                                {event.name}
                                {event.player.id === currentPlayerId && (
                                  <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
                                    ty
                                  </span>
                                )}
                                {index < group.events.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-400">
                            {group.events.length === 1 && group.events[0].score ? (
                              <>
                                typ <span className="font-mono">{group.events[0].score.betHomeScore}:{group.events[0].score.betAwayScore}</span>
                                {' '}· {eventGroupMeta(group)}
                              </>
                            ) : (
                              eventGroupMeta(group)
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-green-700">+{formatPoints(group.points)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="mt-3 rounded-md bg-white px-3 py-3 text-sm text-gray-400 ring-1 ring-gray-200 md:bg-gray-50 md:ring-0">
                    {selectedHasFutureResult
                      ? selectedPoint?.hasOdds
                        ? 'Wynik jeszcze nie jest zamknięty.'
                        : 'Brak zapisanych kursów.'
                      : 'Brak punktowych obstawień.'}
                  </p>
                )}
              </div>
            </div>

            <div className="-mx-3 mt-5 border-t-4 border-gray-200 bg-white px-3 pt-4 sm:-mx-4 sm:px-4 md:mx-0 md:border-t md:border-gray-100 md:bg-transparent md:px-0">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Tabela po tym meczu
              </div>
              <div className="space-y-2">
                {rankingSnapshot.slice(0, 6).map((entry) => (
                  <div key={entry.player.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 text-xs font-bold text-gray-400">
                          {entry.position}.
                        </span>
                        <span className="min-w-0 truncate font-medium text-gray-900">
                          {entry.name}
                          {entry.player.id === currentPlayerId && (
                            <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-600">
                              ty
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="w-5 text-right text-xs font-semibold">{rankDeltaLabel(entry)}</span>
                      <span className="font-mono font-semibold text-gray-800">
                        {formatPoints(entry.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
