import { normalizeHandle, syncBlocklist } from './blocklist';
import { allowlistItem } from './storage';

/** Earlier versions kept the allowlist in sync storage and the whole blocklist in one local item. */
const LEGACY_ALLOWLIST_KEY = 'sync:allowlist';
const LEGACY_BLOCKLIST_KEY = 'local:blocklist';

/**
 * Per-device flag so the legacy merge runs once and cannot bring back handles removed later.
 * Set only after legacy data was merged: on a new device the synced data can land after
 * onInstalled, so an empty read must leave the merge pending for the next run.
 */
export const legacyAllowlistMigratedItem = storage.defineItem<boolean>('local:legacy-allowlist-migrated', {
  fallback: false,
});

/**
 * Merges the legacy sync allowlist into local storage once per device and
 * drops the old combined blocklist item. The sync key is kept: removing it
 * would propagate to other devices still on the old version and wipe their
 * allowlist.
 */
export async function migrateLegacyStorage(): Promise<void> {
  if (await legacyAllowlistMigratedItem.getValue()) return;
  const legacy = await storage.getItem<string[]>(LEGACY_ALLOWLIST_KEY);
  if (legacy && legacy.length > 0) {
    const merged = new Set(await allowlistItem.getValue());
    for (const raw of legacy) {
      const handle = normalizeHandle(raw);
      if (handle) merged.add(handle);
    }
    await allowlistItem.setValue([...merged]);
    await legacyAllowlistMigratedItem.setValue(true);
  }
  await storage.removeItem(LEGACY_BLOCKLIST_KEY);
}

/** Migrates legacy storage, then syncs the blocklist. A failed migration must not skip the sync. */
export async function migrateThenSync(): Promise<void> {
  try {
    await migrateLegacyStorage();
  } finally {
    await syncBlocklist();
  }
}
