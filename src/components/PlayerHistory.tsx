import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Player } from '../db';
import { displayTeamName } from '../utils/displayNames';

export function PlayerHistory({ player, onClose }: { player: Player; onClose: () => void }) {
  const bets = useLiveQuery(() => db.bets.where('playerId').equals(player.id).toArray(), [player.id]);
  const fixtures = useLiveQuery(() => db.fixtures.orderBy('date').toArray(), []);
  const scores = useLiveQuery(() => db.scores.where('playerId').equals(player.id).toArray(), [player.id]);
  const odds = useLiveQuery(() => db.odds.toArray(), []);
  const matchOdds = useLiveQuery(() => db.matchOdds.toArray(), []);

  if (!bets || !fixtures || !scores || !odds || !matchOdds) {
    return <div className="text-gray-400 text-sm">Ładowanie…</div>;
  }

  const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));
  const scoreMap = new Map(scores.map((s) => [s.fixtureId, s]));
  const oddsMap = new Map(odds.map((odd) => [`${odd.fixtureId}:${odd.homeScore}:${odd.awayScore}`, odd.odd]));
  const matchOddsMap = new Map(matchOdds.map((odd) => [odd.fixtureId, odd]));
  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : null;
  const betOutcome = (homeScore: number, awayScore: number) => {
    if (homeScore > awayScore) return 'home';
    if (homeScore < awayScore) return 'away';
    return 'draw';
  };

  const sortedBets = [...bets].sort((a, b) => {
    const fa = fixtureMap.get(a.fixtureId);
    const fb = fixtureMap.get(b.fixtureId);
    return (fa?.date ?? '').localeCompare(fb?.date ?? '');
  });
  const completedBets = sortedBets.filter((bet) => fixtureMap.get(bet.fixtureId)?.status === 'locked');
  const totalPoints = scores.reduce((acc, score) => acc + score.points, 0);
  const avgPoints = completedBets.length > 0 ? totalPoints / completedBets.length : null;
  const effectiveness = completedBets.length > 0 ? (scores.length / completedBets.length) * 100 : null;
  const exactRisk = average(
    sortedBets
      .map((bet) => oddsMap.get(`${bet.fixtureId}:${bet.homeScore}:${bet.awayScore}`))
      .filter((odd): odd is number => odd != null),
  );
  const outcomeRisk = average(
    sortedBets
      .map((bet) => {
        const matchOdd = matchOddsMap.get(bet.fixtureId);
        if (!matchOdd) return null;
        const outcome = betOutcome(bet.homeScore, bet.awayScore);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Historia zakładów — {player.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Śr. pkt/mecz</div>
              <div className="text-sm font-bold text-gray-900">
                {avgPoints == null ? '–' : avgPoints.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Skuteczność</div>
              <div className="text-sm font-bold text-gray-900">
                {effectiveness == null ? '–' : `${effectiveness.toFixed(0)}%`}
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-400">
                Ryzyko
                <span
                  title="Średni kurs wszystkich obstawień z dostępnym kursem: osobno dla dokładnego wyniku i osobno dla W/D/L."
                  className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-gray-300 text-[9px] text-gray-500"
                >
                  ?
                </span>
              </div>
              <div className="text-xs font-bold text-gray-900 leading-snug">
                <div>Dokł. {exactRisk == null ? '–' : exactRisk.toFixed(2)}</div>
                <div>W/D/L {outcomeRisk == null ? '–' : outcomeRisk.toFixed(2)}</div>
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Najlepszy strzał</div>
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
            </div>
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
                  return (
                    <tr key={bet.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-3 text-gray-700">
                        <div className="font-medium">
                          {fixture ? `${displayTeamName(fixture.homeTeam)} – ${displayTeamName(fixture.awayTeam)}` : 'Mecz'}
                        </div>
                        <div className="text-xs text-gray-400">{fixture?.date}</div>
                      </td>
                      <td className="py-2 px-2 text-center font-mono text-gray-800">
                        {bet.homeScore}:{bet.awayScore}
                      </td>
                      <td className="py-2 px-2 text-center font-mono">
                        {isLocked ? (
                          <span className="text-green-600 font-semibold">
                            {fixture.homeScore}:{fixture.awayScore}
                          </span>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {score ? (
                          <span className="text-green-600 font-bold">+{score.points.toFixed(2)}</span>
                        ) : isLocked ? (
                          <span className="text-gray-400 text-xs">chybił</span>
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
