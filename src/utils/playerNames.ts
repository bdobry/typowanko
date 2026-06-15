import type { Player } from '../db';

export function leaderIdsFromRows(rows?: Array<{ player: Pick<Player, 'id'>; total: number }>) {
  const topTotal = rows?.[0]?.total ?? 0;
  if (!rows || topTotal <= 0) return new Set<string>();

  return new Set(
    rows
      .filter((row) => row.total === topTotal)
      .map((row) => row.player.id),
  );
}

export function formatPlayerName(
  player: Pick<Player, 'id' | 'name'>,
  leaderIds?: ReadonlySet<string>,
) {
  return leaderIds?.has(player.id) ? `${player.name} 👑` : player.name;
}
