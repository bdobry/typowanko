import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { db, type Bet, type Fixture, type Player } from '../db';
import { Tooltip } from './Tooltip';
import { displayTeamName } from '../utils/displayNames';
import { getLeaderboardData } from '../utils/scoring';
import { compareFixturesByKickoff } from '../utils/fixtureTime';
import { formatPlayerName, leaderIdsFromRows } from '../utils/playerNames';

function formatLastOnline(value?: number) {
  if (!value) return 'brak danych';
  return new Date(value).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function StatBox({
  label,
  rankLabel,
  children,
}: {
  label: ReactNode;
  rankLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="relative bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 pr-12">
      <span className="absolute right-3 top-2 text-[10px] font-semibold text-gray-400">
        {rankLabel}
      </span>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      {children}
    </div>
  );
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

  for (let index = 0; index < ranked.length; index++) {
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

function scoreOutcome(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

function betResultKind(bet: Bet, fixture?: Fixture) {
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

export function PlayerHistory({ player, onClose }: { player: Player; onClose: () => void }) {
  const currentPlayer = useLiveQuery(() => db.players.get(player.id), [player.id]);
  const bets = useLiveQuery(() => db.bets.where('playerId').equals(player.id).toArray(), [player.id]);
  const allBets = useLiveQuery(() => db.bets.toArray(), []);
  const fixtures = useLiveQuery(() => db.fixtures.orderBy('date').toArray(), []);
  const scores = useLiveQuery(() => db.scores.where('playerId').equals(player.id).toArray(), [player.id]);
  const odds = useLiveQuery(() => db.odds.toArray(), []);
  const matchOdds = useLiveQuery(() => db.matchOdds.toArray(), []);
  const leaderboard = useLiveQuery(() => getLeaderboardData(), []);

  if (!bets || !allBets || !fixtures || !scores || !odds || !matchOdds) {
    return <div className="text-gray-400 text-sm">Ładowanie…</div>;
  }

  const displayedPlayer = currentPlayer ?? player;
  const leaderboardRow = leaderboard?.board.find((row) => row.player.id === player.id);
  const leaderIds = leaderIdsFromRows(leaderboard?.board);
  const rankLabel = leaderboard && leaderboardRow
    ? `${leaderboardRow.currentPosition}/${leaderboard.board.length}`
    : '–/–';
  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
  const scoreMap = new Map(scores.map((s) => [s.fixtureId, s]));
  const oddsMap = new Map(odds.map((odd) => [`${odd.fixtureId}:${odd.homeScore}:${odd.awayScore}`, odd.odd]));
  const matchOddsMap = new Map(matchOdds.map((odd) => [odd.fixtureId, odd]));
  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : null;
  const averageExactRisk = (playerBets: Bet[]) =>
    average(
      playerBets
        .map((bet) => oddsMap.get(`${bet.fixtureId}:${bet.homeScore}:${bet.awayScore}`))
        .filter((odd): odd is number => odd != null),
    );
  const sortedBets = [...bets].sort((a, b) => {
    const fa = fixtureMap.get(a.fixtureId);
    const fb = fixtureMap.get(b.fixtureId);
    if (fa && fb) return compareFixturesByKickoff(fa, fb);
    return (fa?.date ?? '').localeCompare(fb?.date ?? '');
  });
  const completedBets = sortedBets.filter((bet) => fixtureMap.get(bet.fixtureId)?.status === 'locked');
  const totalPoints = scores.reduce((acc, score) => acc + score.points, 0);
  const avgPoints = completedBets.length > 0 ? totalPoints / completedBets.length : null;
  const effectiveness = completedBets.length > 0 ? (scores.length / completedBets.length) * 100 : null;
  const exactRisk = averageExactRisk(sortedBets);
  const outcomeRisk = average(
    sortedBets
      .map((bet) => {
        const matchOdd = matchOddsMap.get(bet.fixtureId);
        if (!matchOdd) return null;
        const outcome = scoreOutcome(bet.homeScore, bet.awayScore);
        return outcome === 'home'
          ? matchOdd.homeOdd
          : outcome === 'draw'
          ? matchOdd.drawOdd
          : matchOdd.awayOdd;
      })
      .filter((odd): odd is number => odd != null),
  );
  const bestScore = [...scores].sort((a, b) => b.points - a.points)[0];
  const bestFixture = bestScore ? fixtureMap.get(bestScore.fixtureId) : null;
  const riskRankLabel = leaderboard
    ? rankLabelFromValues(
        player.id,
        leaderboard.board.map((row) => ({
          playerId: row.player.id,
          value: averageExactRisk(allBets.filter((bet) => bet.playerId === row.player.id)),
        })),
        leaderboard.board.length,
      )
    : '–/–';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Historia zakładów — {formatPlayerName(displayedPlayer, leaderIds)}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Ostatnio online: {formatLastOnline(displayedPlayer.lastOnlineAt)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatBox label="Śr. pkt/mecz" rankLabel={rankLabel}>
              <div className="text-sm font-bold text-gray-900">
                {avgPoints == null ? '–' : avgPoints.toFixed(2)}
              </div>
            </StatBox>
            <StatBox label="Skuteczność" rankLabel={rankLabel}>
              <div className="text-sm font-bold text-gray-900">
                {effectiveness == null ? '–' : `${effectiveness.toFixed(0)}%`}
              </div>
            </StatBox>
            <StatBox
              label={
                <span className="inline-flex items-center gap-1">
                  Średnie ryzyko
                  <Tooltip
                    content="Średni kurs wszystkich obstawień z dostępnym kursem. W rogu widzisz swoje miejsce na tle innych: wyższe ryzyko daje wyższe miejsce."
                  >
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-gray-300 text-[9px] text-gray-500">
                      ?
                    </span>
                  </Tooltip>
                </span>
              }
              rankLabel={riskRankLabel}
            >
              <div className="mt-1 flex items-center gap-4 text-xs font-bold text-gray-900">
                <span>Dokł. {exactRisk == null ? '–' : exactRisk.toFixed(2)}</span>
                <span>W/D/L {outcomeRisk == null ? '–' : outcomeRisk.toFixed(2)}</span>
              </div>
            </StatBox>
            <StatBox label="Najlepszy strzał" rankLabel={rankLabel}>
              <div className="text-sm font-bold text-gray-900">
                {bestScore ? `+${bestScore.points.toFixed(2)}` : '–'}
              </div>
              {bestScore && bestFixture && (
                <div className="text-[10px] text-gray-400 truncate" title={`${displayTeamName(bestFixture.homeTeam)} – ${displayTeamName(bestFixture.awayTeam)}`}>
                  {bestScore.pointType === 'outcome' ? 'W/D/L' : 'dokł.'} · {displayTeamName(bestFixture.homeTeam)} – {displayTeamName(bestFixture.awayTeam)}
                </div>
              )}
              {bestScore && !bestFixture && (
                <div className="text-[10px] text-gray-400">
                  {bestScore.pointType === 'outcome' ? 'W/D/L' : 'dokł.'}
                </div>
              )}
            </StatBox>
          </div>

          {sortedBets.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Brak zakładów.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wider">
                  <th className="text-left pb-2 pr-3">Mecz</th>
                  <th className="text-center pb-2 px-2">Typowanie</th>
                  <th className="text-center pb-2 px-2">Wynik</th>
                  <th className="text-right pb-2">Punkty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedBets.map((bet) => {
                  const fixture = fixtureMap.get(bet.fixtureId);
                  const score = scoreMap.get(bet.fixtureId);
                  const isLocked = fixture?.status === 'locked';
                  const resultKind = betResultKind(bet, fixture);
                  const betClass =
                    resultKind === 'exact'
                      ? 'text-green-700'
                      : resultKind === 'outcome'
                      ? 'text-yellow-700'
                      : resultKind === 'miss'
                      ? 'text-red-600'
                      : 'text-gray-800';
                  const pointsClass =
                    score?.pointType === 'outcome'
                      ? 'text-yellow-700'
                      : score
                      ? 'text-green-600'
                      : '';
                  return (
                    <tr key={bet.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-700">
                        <div className="font-medium">
                          {fixture ? `${displayTeamName(fixture.homeTeam)} – ${displayTeamName(fixture.awayTeam)}` : 'Mecz'}
                        </div>
                        <div className="text-xs text-gray-400">{fixture?.date}</div>
                      </td>
                      <td className={`py-2 px-2 text-center font-mono font-semibold ${betClass}`}>
                        {bet.homeScore}:{bet.awayScore}
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {isLocked ? (
                          <span className="text-gray-950 font-semibold">
                            {fixture.homeScore}:{fixture.awayScore}
                          </span>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {score ? (
                          <span className={`${pointsClass} font-bold`}>+{score.points.toFixed(2)}</span>
                        ) : isLocked ? (
                          <span className="text-red-500 text-xs font-semibold">chybił</span>
                        ) : (
                          <span className="text-gray-300 text-xs">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
