export type FilterMode = 'collapse' | 'hide';

export interface Settings {
  enabled: boolean;
  mode: FilterMode;
}

export interface ListChange {
  added: number;
  removed: number;
  /** Epoch ms of the sync that applied the change. */
  at: number;
}

export interface BlocklistMeta {
  etag: string | null;
  /** Epoch ms of the last successful check (200 or 304). */
  lastSyncedAt: number | null;
  /** Message of the last failed sync, null after a success. */
  lastError: string | null;
  /** The last sync that actually changed the handle set. */
  lastChange: ListChange | null;
}

export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: { enabled: true, mode: 'collapse' },
});

/** Lowercase handles the user never wants filtered. Local storage avoids the 8 KB per-item sync quota. */
export const allowlistItem = storage.defineItem<string[]>('local:allowlist', {
  fallback: [],
});

/** Lowercase, unique handles. Only rewritten when the set changes, because content scripts rescan on every write. */
export const blocklistHandlesItem = storage.defineItem<string[]>('local:blocklist-handles', {
  fallback: [],
});

export const blocklistMetaItem = storage.defineItem<BlocklistMeta>('local:blocklist-meta', {
  fallback: { etag: null, lastSyncedAt: null, lastError: null, lastChange: null },
});
