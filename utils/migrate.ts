import { normalizeHandle } from './blocklist';
import { allowlistItem } from './storage';

/** Earlier versions kept the allowlist in sync storage and the whole blocklist in one local item. */
const LEGACY_ALLOWLIST_KEY = 'sync:allowlist';
const LEGACY_BLOCKLIST_KEY = 'local:blocklist';

/** Per-device flag so the legacy merge runs once and cannot bring back handles removed later. */
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
  }
  await storage.removeItem(LEGACY_BLOCKLIST_KEY);
  await legacyAllowlistMigratedItem.setValue(true);
}
