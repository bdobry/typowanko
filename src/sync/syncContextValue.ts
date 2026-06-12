import { createContext, useContext } from 'react';
import type { CloudCredential, PlayerCode } from './api';

export type AppRole = 'none' | 'local-host' | 'host' | 'viewer' | 'player';

export interface StoredSession extends CloudCredential {
  revision: number;
  lastSyncAt: number;
  viewerId?: string;
  playerCodes?: PlayerCode[];
}

export interface CloudIds {
  hostId: string;
  viewerId: string;
  playerCodes: PlayerCode[];
}

export interface SyncContextValue {
  ready: boolean;
  role: AppRole;
  isViewer: boolean;
  isPlayer: boolean;
  playerId: string | null;
  credential: CloudCredential | null;
  revision: number | null;
  lastSyncAt: number | null;
  syncing: boolean;
  pending: boolean;
  error: string | null;
  notice: string | null;
  cloudIds: CloudIds | null;
  apiBase: string;
  startLocalHost: () => Promise<void>;
  loginWithId: (input: string) => Promise<void>;
  createCloudLeague: () => Promise<CloudIds>;
  syncNow: () => Promise<void>;
  markDirty: () => void;
  submitPlayerBet: (fixtureId: string, homeScore: number, awayScore: number) => Promise<void>;
  regeneratePlayerCodes: () => Promise<void>;
  downloadBackup: () => Promise<void>;
  clearCloudSession: () => Promise<void>;
}

export const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used inside SyncProvider.');
  }
  return context;
}
