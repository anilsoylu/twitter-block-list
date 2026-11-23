export type FilterMode = 'collapse' | 'hide';

export interface Settings {
  enabled: boolean;
  mode: FilterMode;
}

export interface BlocklistState {
  /** Lowercase, unique handles. */
  handles: string[];
  etag: string | null;
  /** Epoch ms of the last successful check (200 or 304). */
  lastSyncedAt: number | null;
  /** Message of the last failed sync, null after a success. */
  lastError: string | null;
}

export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: { enabled: true, mode: 'collapse' },
});

/** Lowercase handles the user never wants filtered. */
export const allowlistItem = storage.defineItem<string[]>('sync:allowlist', {
  fallback: [],
});

export const blocklistItem = storage.defineItem<BlocklistState>('local:blocklist', {
  fallback: { handles: [], etag: null, lastSyncedAt: null, lastError: null },
});
