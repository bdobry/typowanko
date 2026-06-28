import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { db, getViewerDatabaseName, setActiveDatabase, setHostDatabase } from '../db';
import { seedFixtures } from '../db/seed';
import {
  createLeague,
  deleteHostBet as deleteHostBetRequest,
  fetchLeagueSnapshot,
  getSyncApiBase,
  parseCombinedId,
  pushLeagueSnapshot,
  refreshCompletedResults as refreshCompletedResultsRequest,
  regeneratePlayerCodes as regeneratePlayerCodesRequest,
  setFixtureBetVisibility as setFixtureBetVisibilityRequest,
  submitHostBet as submitHostBetRequest,
  SyncApiError,
  submitPlayerBet as submitPlayerBetRequest,
  type CloudCredential,
  type PlayerCode,
  type PlayerPresence,
  type ResultRefreshResponse,
  type SnapshotResponse,
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
  type TypowankoSnapshot,
} from './snapshot';
import {
  SyncContext,
  type AppRole,
  type CloudIds,
  type StoredSession,
  type SyncContextValue,
} from './syncContextValue';
import { refreshLocalCompletedResults } from '../utils/autoResults';
import { fixtureAutoResultEligibleAtMs, hasFixtureStarted } from '../utils/fixtureTime';

const SESSION_STORAGE_KEY = 'typowankoCloudSession';
const AUTO_SYNC_DELAY_MS = 1500;
const VIEWER_POLL_MS = 30000;
const AUTO_RESULT_REFRESH_DEBOUNCE_MS = 3 * 60 * 1000;
const AUTO_RESULT_REFRESH_POLL_MS = 60 * 1000;

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

function autoResultNoticeMessage(lockedCount: number) {
  return lockedCount === 1
    ? 'Automatycznie pobrano wynik zakończonego meczu.'
    : `Automatycznie pobrano wyniki zakończonych meczów: ${lockedCount}.`;
}

function autoResultLockedCount(response: SnapshotResponse | ResultRefreshResponse) {
  return 'lockedFixtureIds' in response ? response.lockedFixtureIds?.length ?? 0 : 0;
}

function shouldUseHostLocalResultFallback(response: ResultRefreshResponse) {
  return response.skippedReason === 'missing_api_key' || response.skippedReason === 'api_error';
}

function hasAutoResultCandidate(snapshot: Pick<TypowankoSnapshot, 'fixtures'>, now: number) {
  return snapshot.fixtures.some(
    (fixture) =>
      fixture.status !== 'locked' &&
      Number.isFinite(fixtureAutoResultEligibleAtMs(fixture)) &&
      now >= fixtureAutoResultEligibleAtMs(fixture),
  );
}

function hasStartedHiddenFixture(snapshot: Pick<TypowankoSnapshot, 'fixtures'>, now: number) {
  return snapshot.fixtures.some(
    (fixture) =>
      fixture.hideBetsUntilKickoff === true &&
      fixture.status !== 'locked' &&
      hasFixtureStarted(fixture, now),
  );
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

async function applyPlayerPresence(playerPresence?: PlayerPresence[]) {
  if (!playerPresence || playerPresence.length === 0) return;

  await db.transaction('rw', db.players, async () => {
    for (const presence of playerPresence) {
      const player = await db.players.get(presence.playerId);
      if (!player || (player.lastOnlineAt ?? 0) >= presence.lastOnlineAt) continue;
      await db.players.update(presence.playerId, { lastOnlineAt: presence.lastOnlineAt });
    }
  });
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
  const lastAutoResultRefreshAt = useRef(0);

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
          const updatedFixtureIds = await seedFixtures();
          if (!cancelled && updatedFixtureIds.length > 0) {
            setPending(true);
          }
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

  const fetchSnapshotWithCompletedResults = useCallback(async (cloudCredential: CloudCredential) => {
    const snapshotResponse = await fetchLeagueSnapshot(cloudCredential);
    const now = Date.now();
    if (!hasAutoResultCandidate(snapshotResponse.snapshot, now)) {
      return snapshotResponse;
    }
    if (now - lastAutoResultRefreshAt.current < AUTO_RESULT_REFRESH_DEBOUNCE_MS) {
      return snapshotResponse;
    }

    lastAutoResultRefreshAt.current = now;
    try {
      return await refreshCompletedResultsRequest(cloudCredential);
    } catch (err) {
      console.warn('Automatic result refresh failed.', err);
      return snapshotResponse;
    }
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
      const response =
        parsed.role === 'viewer' || parsed.role === 'player'
          ? await fetchSnapshotWithCompletedResults(parsed)
          : await fetchLeagueSnapshot(parsed);
      if (parsed.role === 'viewer' || parsed.role === 'player') {
        setActiveDatabase(getViewerDatabaseName(parsed.leagueId));
      } else {
        setHostDatabase();
      }
      await importSnapshot(response.snapshot, db, response.hiddenBets ?? []);
      await applyPlayerPresence(response.playerPresence);
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
      const lockedCount = autoResultLockedCount(response);
      if (lockedCount > 0) {
        setNotice(autoResultNoticeMessage(lockedCount));
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, [fetchSnapshotWithCompletedResults]);

  const createCloudLeague = useCallback(async () => {
    if (!getSyncApiBase()) {
      throw new Error('Brak VITE_SYNC_API_BASE. Dodaj adres Workera do konfiguracji frontendu.');
    }

    setHostDatabase();
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      await seedFixtures();
      const snapshot = await exportSnapshot();
      downloadSnapshot(snapshot, 'pre-sync-backup');
      const response = await createLeague(snapshot);
      await applyPlayerPresence(response.playerPresence);
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
        const response = await fetchSnapshotWithCompletedResults(credential);
        setActiveDatabase(getViewerDatabaseName(credential.leagueId));
        await importSnapshot(response.snapshot, db, response.hiddenBets ?? []);
        await applyPlayerPresence(response.playerPresence);
        const credentialWithPlayerId = withPlayerId(credential, response.playerId);
        const syncedAt = Date.now();
        if (credentialWithPlayerId !== credential) {
          setCredential(credentialWithPlayerId);
        }
        setRevision(response.revision);
        setLastSyncAt(syncedAt);
        saveLastSyncedSnapshot(credential.leagueId, response.snapshot);
        saveStoredSession(toStoredSession(credentialWithPlayerId, response.revision, syncedAt));
        const lockedCount = autoResultLockedCount(response);
        if (lockedCount > 0) {
          setNotice(autoResultNoticeMessage(lockedCount));
        }
      } else {
        if (revision == null) {
          throw new Error('Brak lokalnej rewizji sync. Zaloguj się Host ID ponownie.');
        }
        await seedFixtures();
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
          if (stats.cloudResultsKept > 0) {
            mergedParts.push(`${stats.cloudResultsKept} wyników z chmury`);
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
        if (response.snapshot) {
          setHostDatabase();
          await importSnapshot(response.snapshot, db, response.hiddenBets ?? []);
          snapshotToStore = response.snapshot;
        }
        await applyPlayerPresence(response.playerPresence);
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
  }, [cloudIds, credential, fetchSnapshotWithCompletedResults, revision, role]);

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

  const applyAuthoritativeSnapshotResponse = useCallback(async (response: SnapshotResponse) => {
    if (!credential || role === 'none' || role === 'local-host') return;

    if (role === 'viewer' || role === 'player') {
      setActiveDatabase(getViewerDatabaseName(credential.leagueId));
    } else {
      setHostDatabase();
    }

    await importSnapshot(response.snapshot, db, response.hiddenBets ?? []);
    await applyPlayerPresence(response.playerPresence);
    const credentialWithPlayerId = withPlayerId(credential, response.playerId);
    const syncedAt = Date.now();
    if (credentialWithPlayerId !== credential) {
      setCredential(credentialWithPlayerId);
    }
    setRevision(response.revision);
    setLastSyncAt(syncedAt);
    setPending(false);
    saveLastSyncedSnapshot(credential.leagueId, response.snapshot);
    saveStoredSession(toStoredSession(credentialWithPlayerId, response.revision, syncedAt, cloudIds));
  }, [cloudIds, credential, role]);

  const refreshCompletedResultsNow = useCallback(async () => {
    if (role === 'none') return;
    if (syncing || (role === 'host' && pending)) return;

    const now = Date.now();
    await seedFixtures();
    const localSnapshot = await exportSnapshot();
    const shouldRefreshResults = hasAutoResultCandidate(localSnapshot, now);
    const shouldRevealHiddenBets = role !== 'local-host' && hasStartedHiddenFixture(localSnapshot, now);
    if (!shouldRefreshResults && !shouldRevealHiddenBets) return;
    if (shouldRefreshResults) {
      if (now - lastAutoResultRefreshAt.current < AUTO_RESULT_REFRESH_DEBOUNCE_MS) return;
      lastAutoResultRefreshAt.current = now;
    }

    try {
      if (role === 'local-host') {
        const lockedFixtureIds = await refreshLocalCompletedResults(now);
        if (lockedFixtureIds.length > 0) {
          setNotice(autoResultNoticeMessage(lockedFixtureIds.length));
        }
        return;
      }

      if (!credential) return;
      const response = shouldRefreshResults
        ? await refreshCompletedResultsRequest(credential)
        : await fetchLeagueSnapshot(credential);
      if (shouldRefreshResults && role === 'host') {
        const resultResponse = response as ResultRefreshResponse;
        if (shouldUseHostLocalResultFallback(resultResponse)) {
          if (resultResponse.skippedReason === 'api_error') {
            console.warn('Cloud automatic result refresh could not use API-Football.', resultResponse.failedFixtures);
          }
          const lockedFixtureIds = await refreshLocalCompletedResults(now);
          if (lockedFixtureIds.length > 0) {
            markDirty();
            const message = autoResultNoticeMessage(lockedFixtureIds.length);
            setNotice(
              resultResponse.skippedReason === 'api_error'
                ? `${message} Worker API-Football nie odpowiedział, więc host użył lokalnego klucza.`
                : message,
            );
            return;
          }
        }
      }

      if (role === 'viewer' || role === 'player') {
        setActiveDatabase(getViewerDatabaseName(credential.leagueId));
      } else {
        setHostDatabase();
      }

      await importSnapshot(response.snapshot, db, response.hiddenBets ?? []);
      await applyPlayerPresence(response.playerPresence);
      const credentialWithPlayerId = withPlayerId(credential, response.playerId);
      const syncedAt = Date.now();
      if (credentialWithPlayerId !== credential) {
        setCredential(credentialWithPlayerId);
      }
      setRevision(response.revision);
      setLastSyncAt(syncedAt);
      setPending(false);
      saveLastSyncedSnapshot(credential.leagueId, response.snapshot);
      saveStoredSession(toStoredSession(credentialWithPlayerId, response.revision, syncedAt, cloudIds));

      const lockedCount = autoResultLockedCount(response);
      if (lockedCount > 0) {
        setNotice(autoResultNoticeMessage(lockedCount));
      }
    } catch (err) {
      console.warn('Automatic result refresh failed.', err);
    }
  }, [cloudIds, credential, markDirty, pending, role, syncing]);

  const submitPlayerBet = useCallback(async (fixtureId: string, homeScore: number, awayScore: number) => {
    if (role !== 'player' || !credential) {
      throw new Error('Tylko gracz może zapisać własny zakład.');
    }
    const fixture = await db.fixtures.get(fixtureId);
    if (fixture && hasFixtureStarted(fixture)) {
      throw new Error('Mecz już się rozpoczął. Zakładów nie można już zmieniać.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await submitPlayerBetRequest(credential, fixtureId, homeScore, awayScore);
      setActiveDatabase(getViewerDatabaseName(credential.leagueId));
      await importSnapshot(response.snapshot, db, response.hiddenBets ?? []);
      await applyPlayerPresence(response.playerPresence);
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

  const submitHostBet = useCallback(async (
    fixtureId: string,
    targetPlayerId: string,
    homeScore: number,
    awayScore: number,
  ) => {
    if (role !== 'host' || !credential) {
      throw new Error('Tylko cloud host może zapisać zakład gracza przez API.');
    }
    const fixture = await db.fixtures.get(fixtureId);
    if (fixture && hasFixtureStarted(fixture)) {
      throw new Error('Mecz już się rozpoczął. Zakładów nie można już zmieniać.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await submitHostBetRequest(
        credential,
        fixtureId,
        targetPlayerId,
        homeScore,
        awayScore,
      );
      await applyAuthoritativeSnapshotResponse(response);
      setNotice('Zapisano zakład gracza.');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, [applyAuthoritativeSnapshotResponse, credential, role]);

  const deleteHostBet = useCallback(async (fixtureId: string, targetPlayerId: string) => {
    if (role !== 'host' || !credential) {
      throw new Error('Tylko cloud host może usunąć zakład gracza przez API.');
    }
    const fixture = await db.fixtures.get(fixtureId);
    if (fixture && hasFixtureStarted(fixture)) {
      throw new Error('Mecz już się rozpoczął. Zakładów nie można już zmieniać.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await deleteHostBetRequest(credential, fixtureId, targetPlayerId);
      await applyAuthoritativeSnapshotResponse(response);
      setNotice('Usunięto zakład gracza.');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, [applyAuthoritativeSnapshotResponse, credential, role]);

  const setFixtureBetVisibility = useCallback(async (
    fixtureId: string,
    hideBetsUntilKickoff: boolean,
  ) => {
    if (role !== 'host' || !credential) {
      throw new Error('Tylko cloud host może zmienić twarde ukrywanie typów.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await setFixtureBetVisibilityRequest(
        credential,
        fixtureId,
        hideBetsUntilKickoff,
      );
      await applyAuthoritativeSnapshotResponse(response);
      setNotice(hideBetsUntilKickoff ? 'Ukryto wyniki typów do startu meczu.' : 'Odsłonięto wyniki typów.');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      setSyncing(false);
    }
  }, [applyAuthoritativeSnapshotResponse, credential, role]);

  const regeneratePlayerCodes = useCallback(async () => {
    if (role !== 'host' || !credential) {
      throw new Error('Tylko host może generować Player ID.');
    }

    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await regeneratePlayerCodesRequest(credential);
      await applyPlayerPresence(response.playerPresence);
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

  useEffect(() => {
    if (!ready || role === 'none') return undefined;
    if (role !== 'local-host' && !credential) return undefined;

    const initialRefresh = window.setTimeout(() => {
      refreshCompletedResultsNow().catch(() => {
        // Background refresh errors are intentionally non-blocking.
      });
    }, 2500);

    const interval = window.setInterval(() => {
      refreshCompletedResultsNow().catch(() => {
        // Background refresh errors are intentionally non-blocking.
      });
    }, AUTO_RESULT_REFRESH_POLL_MS);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [credential, ready, refreshCompletedResultsNow, role]);

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
      submitHostBet,
      deleteHostBet,
      setFixtureBetVisibility,
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
      submitHostBet,
      deleteHostBet,
      setFixtureBetVisibility,
      regeneratePlayerCodes,
      downloadBackup,
      clearCloudSession,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
