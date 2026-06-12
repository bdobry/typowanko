import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getViewerDatabaseName, setActiveDatabase, setHostDatabase } from '../db';
import { seedFixtures } from '../db/seed';
import {
  createLeague,
  fetchLeagueSnapshot,
  getSyncApiBase,
  parseCombinedId,
  pushLeagueSnapshot,
  regeneratePlayerCodes as regeneratePlayerCodesRequest,
  SyncApiError,
  submitPlayerBet as submitPlayerBetRequest,
  type CloudCredential,
  type PlayerCode,
} from './api';
import { mergeHostSnapshotWithCloud } from './merge';
import {
  downloadSnapshot,
  exportSnapshot,
  hasHostProgress,
  importSnapshot,
  loadLastSyncedSnapshot,
  removeLastSyncedSnapshot,
  saveLastSyncedSnapshot,
} from './snapshot';
import {
  SyncContext,
  type AppRole,
  type CloudIds,
  type StoredSession,
  type SyncContextValue,
} from './syncContextValue';

const SESSION_STORAGE_KEY = 'typowankoCloudSession';
const AUTO_SYNC_DELAY_MS = 1500;
const VIEWER_POLL_MS = 30000;

function loadStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      (parsed.role === 'host' || parsed.role === 'viewer' || parsed.role === 'player') &&
      parsed.leagueId &&
      parsed.code
    ) {
      return parsed;
    }
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
  return null;
}

function saveStoredSession(session: StoredSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function toStoredSession(
  credential: CloudCredential,
  revision: number,
  lastSyncAt: number,
  cloudIds?: CloudIds | null,
): StoredSession {
  return {
    ...credential,
    revision,
    lastSyncAt,
    viewerId: cloudIds?.viewerId,
    playerCodes: cloudIds?.playerCodes,
  };
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function mergePlayerCodes(existing: CloudIds | null, newCodes: PlayerCode[], hostId: string) {
  if (newCodes.length === 0) return existing;

  const codeMap = new Map((existing?.playerCodes ?? []).map((code) => [code.playerId, code]));
  for (const code of newCodes) {
    codeMap.set(code.playerId, code);
  }

  return {
    hostId: existing?.hostId ?? hostId,
    viewerId: existing?.viewerId ?? '',
    playerCodes: Array.from(codeMap.values()),
  };
}

function withPlayerId(credential: CloudCredential, playerId?: string) {
  if (!playerId || credential.playerId === playerId) return credential;
  return { ...credential, playerId };
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<AppRole>('none');
  const [credential, setCredential] = useState<CloudCredential | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cloudIds, setCloudIds] = useState<CloudIds | null>(null);
  const autoSyncTimer = useRef<number | null>(null);

  const applyStoredSession = useCallback((stored: StoredSession) => {
    if (stored.role === 'viewer' || stored.role === 'player') {
      setActiveDatabase(getViewerDatabaseName(stored.leagueId));
    } else {
      setHostDatabase();
    }

    setRole(stored.role);
    setCredential({
      role: stored.role,
      leagueId: stored.leagueId,
      code: stored.code,
      combinedId: stored.combinedId,
      playerId: stored.playerId,
    });
    setRevision(stored.revision);
    setLastSyncAt(stored.lastSyncAt);
    if (stored.role === 'host') {
      setCloudIds({
        hostId: stored.combinedId,
        viewerId: stored.viewerId ?? '',
        playerCodes: stored.playerCodes ?? [],
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const stored = loadStoredSession();
      if (stored) {
        applyStoredSession(stored);
        if (stored.role === 'host') {
          await seedFixtures();
        }
        if (!cancelled) setReady(true);
        return;
      }

      setHostDatabase();
      const hasProgress = await hasHostProgress();
      if (hasProgress) {
        await seedFixtures();
        if (!cancelled) setRole('local-host');
      }
      if (!cancelled) setReady(true);
    }

    boot().catch((err) => {
      setError(getErrorMessage(err));
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (autoSyncTimer.current != null) {
        window.clearTimeout(autoSyncTimer.current);
      }
    };
  }, [applyStoredSession]);

  const startLocalHost = useCallback(async () => {
    setHostDatabase();
    await seedFixtures();
    setRole('local-host');
    setCredential(null);
    setRevision(null);
    setLastSyncAt(null);
    setError(null);
    setNotice(null);
  }, []);

  const loginWithId = useCallback(async (input: string) => {
    const parsed = parseCombinedId(input);
    if (!parsed) {
      throw new Error('Niepoprawny format ID. Wklej ID zaczynające się od TYP-H-, TYP-V- albo TYP-P-.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetchLeagueSnapshot(parsed);
      if (parsed.role === 'viewer' || parsed.role === 'player') {
        setActiveDatabase(getViewerDatabaseName(parsed.leagueId));
      } else {
        setHostDatabase();
      }
      await importSnapshot(response.snapshot);
      const credentialWithPlayerId = {
        ...parsed,
        playerId: response.playerId ?? parsed.playerId,
      };

      const syncedAt = Date.now();
      setRole(parsed.role);
      setCredential(credentialWithPlayerId);
      setRevision(response.revision);
      setLastSyncAt(syncedAt);
      setPending(false);
      setCloudIds(parsed.role === 'host' ? { hostId: parsed.combinedId, viewerId: '', playerCodes: [] } : null);
      saveLastSyncedSnapshot(parsed.leagueId, response.snapshot);
      saveStoredSession(toStoredSession(credentialWithPlayerId, response.revision, syncedAt));
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, []);

  const createCloudLeague = useCallback(async () => {
    if (!getSyncApiBase()) {
      throw new Error('Brak VITE_SYNC_API_BASE. Dodaj adres Workera do konfiguracji frontendu.');
    }

    setHostDatabase();
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const snapshot = await exportSnapshot();
      downloadSnapshot(snapshot, 'pre-sync-backup');
      const response = await createLeague(snapshot);
      const hostCredential = parseCombinedId(response.hostId);
      if (!hostCredential || hostCredential.role !== 'host') {
        throw new Error('Worker zwrócił niepoprawny Host ID.');
      }

      const ids: CloudIds = {
        hostId: response.hostId,
        viewerId: response.viewerId,
        playerCodes: response.playerCodes,
      };
      const syncedAt = Date.now();
      setRole('host');
      setCredential(hostCredential);
      setRevision(response.revision);
      setLastSyncAt(syncedAt);
      setPending(false);
      setCloudIds(ids);
      saveLastSyncedSnapshot(hostCredential.leagueId, snapshot);
      saveStoredSession(toStoredSession(hostCredential, response.revision, syncedAt, ids));
      return ids;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!credential || role === 'none' || role === 'local-host') return;

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      if (role === 'viewer' || role === 'player') {
        const response = await fetchLeagueSnapshot(credential);
        setActiveDatabase(getViewerDatabaseName(credential.leagueId));
        await importSnapshot(response.snapshot);
        const credentialWithPlayerId = withPlayerId(credential, response.playerId);
        const syncedAt = Date.now();
        if (credentialWithPlayerId !== credential) {
          setCredential(credentialWithPlayerId);
        }
        setRevision(response.revision);
        setLastSyncAt(syncedAt);
        saveLastSyncedSnapshot(credential.leagueId, response.snapshot);
        saveStoredSession(toStoredSession(credentialWithPlayerId, response.revision, syncedAt));
      } else {
        if (revision == null) {
          throw new Error('Brak lokalnej rewizji sync. Zaloguj się Host ID ponownie.');
        }
        const snapshot = await exportSnapshot();
        let snapshotToStore = snapshot;
        let response;
        try {
          response = await pushLeagueSnapshot(credential, snapshot, revision);
        } catch (err) {
          if (!(err instanceof SyncApiError && err.status === 409)) {
            throw err;
          }

          const baseSnapshot = loadLastSyncedSnapshot(credential.leagueId);
          if (!baseSnapshot) {
            throw new Error(
              'Cloud snapshot changed, but this browser no longer has the last synced snapshot needed for an automatic merge. No data was overwritten. Refresh from cloud or re-login with Host ID, then try again.',
              { cause: err },
            );
          }

          const cloudResponse = await fetchLeagueSnapshot(credential);
          const { snapshot: mergedSnapshot, stats } = mergeHostSnapshotWithCloud(
            baseSnapshot,
            snapshot,
            cloudResponse.snapshot,
          );
          await importSnapshot(mergedSnapshot);
          response = await pushLeagueSnapshot(credential, mergedSnapshot, cloudResponse.revision);
          snapshotToStore = mergedSnapshot;

          const mergedParts: string[] = [];
          if (stats.cloudBetsKept > 0) {
            mergedParts.push(`${stats.cloudBetsKept} zakładów z chmury`);
          }
          if (stats.hostConflictsWon > 0) {
            mergedParts.push(`${stats.hostConflictsWon} konfliktów zakładów rozstrzygniętych po stronie hosta`);
          }
          setNotice(
            mergedParts.length > 0
              ? `Zmergowano konflikt sync: ${mergedParts.join(', ')}.`
              : 'Cloud był nowszy; lokalny snapshot hosta został bezpiecznie ponownie wysłany.',
          );
        }
        const syncedAt = Date.now();
        setRevision(response.revision);
        setLastSyncAt(syncedAt);
        setPending(false);
        const nextCloudIds = mergePlayerCodes(
          cloudIds,
          response.playerCodes ?? [],
          credential.combinedId,
        );
        if (nextCloudIds !== cloudIds) {
          setCloudIds(nextCloudIds);
        }
        saveLastSyncedSnapshot(credential.leagueId, snapshotToStore);
        saveStoredSession(toStoredSession(credential, response.revision, syncedAt, nextCloudIds));
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, [cloudIds, credential, revision, role]);

  const markDirty = useCallback(() => {
    if (role !== 'host' || !credential) return;
    setPending(true);
    if (autoSyncTimer.current != null) {
      window.clearTimeout(autoSyncTimer.current);
    }
    autoSyncTimer.current = window.setTimeout(() => {
      syncNow().catch(() => {
        // Error state is set by syncNow.
      });
    }, AUTO_SYNC_DELAY_MS);
  }, [credential, role, syncNow]);

  const submitPlayerBet = useCallback(async (fixtureId: string, homeScore: number, awayScore: number) => {
    if (role !== 'player' || !credential) {
      throw new Error('Tylko gracz może zapisać własny zakład.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await submitPlayerBetRequest(credential, fixtureId, homeScore, awayScore);
      setActiveDatabase(getViewerDatabaseName(credential.leagueId));
      await importSnapshot(response.snapshot);
      const credentialWithPlayerId = withPlayerId(credential, response.playerId);
      const syncedAt = Date.now();
      if (credentialWithPlayerId !== credential) {
        setCredential(credentialWithPlayerId);
      }
      setRevision(response.revision);
      setLastSyncAt(syncedAt);
      setPending(false);
      setNotice('Zapisano Twój zakład.');
      saveLastSyncedSnapshot(credential.leagueId, response.snapshot);
      saveStoredSession(toStoredSession(credentialWithPlayerId, response.revision, syncedAt));
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, [credential, role]);

  const regeneratePlayerCodes = useCallback(async () => {
    if (role !== 'host' || !credential) {
      throw new Error('Tylko host może generować Player ID.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await regeneratePlayerCodesRequest(credential);
      const nextCloudIds: CloudIds = {
        hostId: cloudIds?.hostId ?? credential.combinedId,
        viewerId: cloudIds?.viewerId ?? '',
        playerCodes: response.playerCodes,
      };
      const syncedAt = Date.now();
      setCloudIds(nextCloudIds);
      setLastSyncAt(syncedAt);
      setNotice('Wygenerowano nowe Player ID. Stare Player ID przestały działać.');
      saveStoredSession(toStoredSession(credential, revision ?? response.revision, syncedAt, nextCloudIds));
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, [cloudIds, credential, revision, role]);

  const downloadBackup = useCallback(async () => {
    const snapshot = await exportSnapshot();
    downloadSnapshot(snapshot, role === 'viewer' || role === 'player' ? 'viewer-cache' : 'backup');
  }, [role]);

  const clearCloudSession = useCallback(async () => {
    const leagueId = credential?.leagueId;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    if (leagueId) {
      removeLastSyncedSnapshot(leagueId);
    }
    setHostDatabase();
    const hasProgress = await hasHostProgress();
    setRole(hasProgress ? 'local-host' : 'none');
    setCredential(null);
    setRevision(null);
    setLastSyncAt(null);
    setPending(false);
    setError(null);
    setNotice(null);
    setCloudIds(null);
  }, [credential?.leagueId]);

  useEffect(() => {
    if (!ready || (role !== 'viewer' && role !== 'player') || !credential) return undefined;

    const initialSync = window.setTimeout(() => {
      syncNow().catch(() => {
        // Error state is set by syncNow.
      });
    }, 0);

    const interval = window.setInterval(() => {
      syncNow().catch(() => {
        // Error state is set by syncNow.
      });
    }, VIEWER_POLL_MS);

    function handleFocus() {
      syncNow().catch(() => {
        // Error state is set by syncNow.
      });
    }

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [credential, ready, role, syncNow]);

  const value = useMemo<SyncContextValue>(
    () => ({
      ready,
      role,
      isViewer: role === 'viewer' || role === 'player',
      isPlayer: role === 'player',
      playerId: credential?.playerId ?? null,
      credential,
      revision,
      lastSyncAt,
      syncing,
      pending,
      error,
      notice,
      cloudIds,
      apiBase: getSyncApiBase(),
      startLocalHost,
      loginWithId,
      createCloudLeague,
      syncNow,
      markDirty,
      submitPlayerBet,
      regeneratePlayerCodes,
      downloadBackup,
      clearCloudSession,
    }),
    [
      ready,
      role,
      credential,
      revision,
      lastSyncAt,
      syncing,
      pending,
      error,
      notice,
      cloudIds,
      startLocalHost,
      loginWithId,
      createCloudLeague,
      syncNow,
      markDirty,
      submitPlayerBet,
      regeneratePlayerCodes,
      downloadBackup,
      clearCloudSession,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
