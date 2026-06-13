import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Player } from '../db';
import {
  getLeaderboardData,
  type LeaderboardData,
  type LeaderboardEvent,
  type LeaderboardRow,
} from '../utils/scoring';
import { useSync } from '../sync/syncContextValue';
import { PlayerHistory } from '../components/PlayerHistory';
import { displayTeamName } from '../utils/displayNames';

const MEDALS = ['🥇', '🥈', '🥉'];
const CHART_COLORS = [
  '#166534',
  '#2563eb',
  '#dc2626',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4d7c0f',
  '#475569',
  '#a16207',
];

function formatPoints(value: number) {
  return value.toFixed(2);
}

function shortDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  });
}

function fixtureLabel(event: LeaderboardEvent) {
  return `${displayTeamName(event.fixture.homeTeam)} – ${displayTeamName(event.fixture.awayTeam)}`;
}

function scoreTypeLabel(event: LeaderboardEvent) {
  return event.score.pointType === 'outcome' ? 'trafiony W/D/L' : 'dokładny wynik';
}

interface ChartHover {
  key: string;
  x: number;
  y: number;
  playerName: string;
  total: number;
  fixtureName: string;
  date: string;
  color: string;
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

function FormStreak({ row }: { row: LeaderboardRow }) {
  if (row.recentForm.length === 0) {
    return <span className="text-gray-300 font-mono">-</span>;
  }

  return (
    <span className="inline-flex items-center justify-center gap-1">
      {row.recentForm.map((entry) => {
        const className =
          entry.result === 'upcoming'
            ? 'bg-gray-200 text-gray-600'
            : entry.result === 'exact'
            ? 'bg-green-600 text-white'
            : entry.result === 'outcome'
            ? 'bg-yellow-300 text-yellow-900'
            : entry.result === 'miss'
            ? 'bg-red-500 text-white'
            : 'bg-gray-200 text-gray-500';
        const label =
          entry.result === 'upcoming'
            ? '?'
            : entry.result === 'exact'
            ? 'Z'
            : entry.result === 'outcome'
            ? 'R'
            : entry.result === 'miss'
            ? 'P'
            : '-';
        const title =
          `${displayTeamName(entry.fixture.homeTeam)} - ${displayTeamName(entry.fixture.awayTeam)}: ` +
          (entry.result === 'upcoming'
            ? 'najbliższy mecz'
            : entry.result === 'none'
            ? 'brak obstawienia'
            : entry.result === 'miss'
            ? 'nietrafione'
            : `${entry.result === 'exact' ? 'dokładny wynik' : 'W/D/L'} +${formatPoints(entry.points)} pkt`);

        return (
          <span
            key={entry.fixture.id}
            title={title}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${className}`}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

function ProgressChart({ data, rows }: { data: LeaderboardData['timeline']; rows: LeaderboardRow[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartHover | null>(null);

  if (data.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Postęp punktów</h2>
        <p className="text-gray-400 text-sm bg-white border border-gray-200 rounded-lg px-4 py-6 text-center">
          Brak zakończonych meczów.
        </p>
      </div>
    );
  }

  const width = 760;
  const height = 280;
  const margin = { top: 18, right: 20, bottom: 44, left: 48 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxPoints = Math.max(
    1,
    ...data.flatMap((point) => rows.map((row) => point.totalsByPlayerId[row.player.id] ?? 0)),
  );
  const xFor = (index: number) =>
    data.length === 1
      ? margin.left
      : margin.left + (index / (data.length - 1)) * chartWidth;
  const yFor = (points: number) =>
    margin.top + chartHeight - (points / maxPoints) * chartHeight;
  const yTicks = [0, maxPoints / 2, maxPoints];
  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];
  const tooltipWidth = 220;
  const tooltipHeight = 74;
  const tooltip = hoveredPoint
    ? {
        x:
          hoveredPoint.x + tooltipWidth + 14 > width - margin.right
            ? hoveredPoint.x - tooltipWidth - 14
            : hoveredPoint.x + 14,
        y:
          hoveredPoint.y - tooltipHeight - 12 < margin.top
            ? hoveredPoint.y + 14
            : hoveredPoint.y - tooltipHeight - 12,
      }
    : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Postęp punktów</h2>
        <span className="text-xs text-gray-400">
          {data.length} {data.length === 1 ? 'mecz' : 'meczów'}
        </span>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-3">
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full h-auto" role="img">
            <title>Postęp punktów od pierwszego do ostatniego zakończonego meczu</title>
            {yTicks.map((tick) => {
              const y = yFor(tick);
              return (
                <g key={tick}>
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={width - margin.right}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                  <text x={margin.left - 10} y={y + 4} textAnchor="end" className="fill-gray-400 text-[11px]">
                    {tick.toFixed(tick >= 10 ? 0 : 1)}
                  </text>
                </g>
              );
            })}
            <line
              x1={margin.left}
              y1={margin.top}
              x2={margin.left}
              y2={margin.top + chartHeight}
              stroke="#d1d5db"
              strokeWidth="1"
            />
            <line
              x1={margin.left}
              y1={margin.top + chartHeight}
              x2={width - margin.right}
              y2={margin.top + chartHeight}
              stroke="#d1d5db"
              strokeWidth="1"
            />
            {rows.map((row, playerIndex) => {
              const color = CHART_COLORS[playerIndex % CHART_COLORS.length];
              const points = data.map((point, index) => ({
                x: xFor(index),
                y: yFor(point.totalsByPlayerId[row.player.id] ?? 0),
                total: point.totalsByPlayerId[row.player.id] ?? 0,
                point,
              }));
              const path = points
                .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                .join(' ');

              return (
                <g key={row.player.id}>
                  <path d={path} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" />
                  {points.map((point) => {
                    const key = `${row.player.id}:${point.point.fixture.id}`;
                    const fixtureName = `${displayTeamName(point.point.fixture.homeTeam)} - ${displayTeamName(point.point.fixture.awayTeam)}`;
                    const hover: ChartHover = {
                      key,
                      x: point.x,
                      y: point.y,
                      playerName: row.player.name,
                      total: point.total,
                      fixtureName,
                      date: shortDate(point.point.fixture.date),
                      color,
                    };
                    const isHovered = hoveredPoint?.key === key;
                    return (
                      <circle
                        key={key}
                        cx={point.x}
                        cy={point.y}
                        r={isHovered ? 5 : 3}
                        fill={color}
                        stroke={isHovered ? '#111827' : 'white'}
                        strokeWidth={isHovered ? 1.5 : 1}
                        tabIndex={0}
                        className="cursor-pointer outline-none"
                        aria-label={`${row.player.name}: ${formatPoints(point.total)} punktów po meczu ${fixtureName}`}
                        onMouseEnter={() => setHoveredPoint(hover)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onFocus={() => setHoveredPoint(hover)}
                        onBlur={() => setHoveredPoint(null)}
                      />
                    );
                  })}
                </g>
              );
            })}
            {hoveredPoint && tooltip && (
              <g pointerEvents="none" transform={`translate(${tooltip.x} ${tooltip.y})`}>
                <rect
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx="6"
                  fill="white"
                  stroke="#d1d5db"
                  strokeWidth="1"
                  filter="drop-shadow(0 2px 6px rgb(0 0 0 / 0.12))"
                />
                <circle cx="14" cy="18" r="4" fill={hoveredPoint.color} />
                <text x="26" y="22" className="fill-gray-900 text-[12px] font-semibold">
                  {hoveredPoint.playerName}
                </text>
                <text x="12" y="42" className="fill-gray-600 text-[11px]">
                  {formatPoints(hoveredPoint.total)} pkt · {hoveredPoint.date}
                </text>
                <text x="12" y="60" className="fill-gray-500 text-[10px]">
                  {hoveredPoint.fixtureName}
                </text>
              </g>
            )}
            <text x={margin.left} y={height - 14} textAnchor="start" className="fill-gray-400 text-[11px]">
              Mecz 1 · {shortDate(firstPoint.fixture.date)}
            </text>
            {data.length > 1 && (
              <text x={width - margin.right} y={height - 14} textAnchor="end" className="fill-gray-400 text-[11px]">
                Mecz {lastPoint.matchNumber} · {shortDate(lastPoint.fixture.date)}
              </text>
            )}
          </svg>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-xs">
          {rows.map((row, index) => (
            <span key={row.player.id} className="inline-flex items-center gap-1.5 text-gray-600">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              {row.player.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Leaderboard() {
  const { isViewer, playerId } = useSync();
  const data = useLiveQuery(() => getLeaderboardData(), []);
  const [historyPlayer, setHistoryPlayer] = useState<Player | null>(null);

  if (!data) return <div className="text-gray-400 text-center py-12">Ładowanie…</div>;

  const fixtureById = new Map(data.timeline.map((point) => [point.fixture.id, point.fixture]));
  const bestHits = data.board
    .flatMap(({ player, history }) =>
      history.map((score) => ({
        ...score,
        playerName: player.name,
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
                  <th className="px-4 py-2.5 text-center">Dokładne</th>
                  <th className="px-4 py-2.5 text-center">W/D/L</th>
                  <th className="px-4 py-2.5 text-right">Punkty</th>
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
                          {row.player.name}
                        </button>
                        {row.player.id === playerId && (
                          <span className="ml-2 text-[10px] text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">
                            ty
                          </span>
                        )}
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
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-gray-900 text-base">
                          {formatPoints(row.total)}
                          <span className="text-xs font-normal text-gray-400 ml-1">pkt</span>
                          <LastMatchPoints value={row.lastMatchPoints} hasLastFixture={data.lastFixture != null} />
                        </div>
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
        </div>
      )}

      {data.board.length > 0 && (
        <ProgressChart data={data.timeline} rows={data.board} />
      )}

      {/* Recent events */}
      {data.recentEvents.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Ostatnie zdarzenia</h2>
          <div className="space-y-1.5">
            {data.recentEvents.map((event) => (
              <div
                key={event.id}
                className="text-sm bg-white rounded-lg px-4 py-2.5 flex gap-3 items-center border border-gray-200"
              >
                <span className="text-xs text-gray-400 w-16 shrink-0">{shortDate(event.fixture.date)}</span>
                <span className="text-gray-700 flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{event.player.name}</span>
                  {event.player.id === playerId && (
                    <span className="ml-2 text-[10px] text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">
                      ty
                    </span>
                  )}
                  <span className="text-gray-500"> · {scoreTypeLabel(event)} · </span>
                  <span className="truncate">{fixtureLabel(event)}</span>
                </span>
                <span className="hidden sm:inline text-gray-500 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {event.score.betHomeScore}:{event.score.betAwayScore} / {event.score.resultHomeScore}:{event.score.resultAwayScore}
                </span>
                <span className="text-green-600 font-bold shrink-0">+{formatPoints(event.score.points)}</span>
              </div>
            ))}
          </div>
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
    </div>
  );
}
