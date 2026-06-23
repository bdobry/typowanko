import { useEffect, useState } from 'react';

const ONLINE_LIMIT_MS = 5 * 60 * 1000;
const RECENT_LIMIT_MS = 15 * 60 * 1000;

function formatLastSeen(lastOnlineAt?: number) {
  if (!lastOnlineAt) return 'brak danych';

  return new Date(lastOnlineAt).toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function onlineStatusLabel(ageMs: number, lastOnlineAt?: number) {
  if (!lastOnlineAt) return 'Ostatnio widziany: brak danych';

  const status =
    ageMs <= ONLINE_LIMIT_MS
      ? 'Online'
      : ageMs <= RECENT_LIMIT_MS
      ? 'Aktywny niedawno'
      : 'Offline';

  return `${status} · ostatnio widziany: ${formatLastSeen(lastOnlineAt)}`;
}

export function PlayerOnlineStatusDot({ lastOnlineAt }: { lastOnlineAt?: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();

    const intervalId = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const ageMs = lastOnlineAt && now != null ? now - lastOnlineAt : Number.POSITIVE_INFINITY;
  const className =
    ageMs <= ONLINE_LIMIT_MS
      ? 'bg-green-500 ring-green-100 animate-pulse'
      : ageMs <= RECENT_LIMIT_MS
      ? 'bg-yellow-400 ring-yellow-100'
      : 'bg-gray-300 ring-gray-100';

  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${className}`}
      title={onlineStatusLabel(ageMs, lastOnlineAt)}
      aria-label={onlineStatusLabel(ageMs, lastOnlineAt)}
    />
  );
}
