import { normalizeHandle } from './blocklist';
import { allowlistItem } from './storage';

/** Earlier versions kept the allowlist in sync storage and the whole blocklist in one local item. */
const LEGACY_ALLOWLIST_KEY = 'sync:allowlist';
const LEGACY_BLOCKLIST_KEY = 'local:blocklist';

/**
 * Moves the allowlist from sync to local storage and drops the old combined
 * blocklist item. Safe to run more than once: missing legacy keys are a no-op.
 */
export async function migrateLegacyStorage(): Promise<void> {
  const legacy = await storage.getItem<string[]>(LEGACY_ALLOWLIST_KEY);
  if (legacy && legacy.length > 0) {
    const merged = new Set(await allowlistItem.getValue());
    for (const raw of legacy) {
      const handle = normalizeHandle(raw);
      if (handle) merged.add(handle);
    }
    await allowlistItem.setValue([...merged]);
  }
  await Promise.all([storage.removeItem(LEGACY_ALLOWLIST_KEY), storage.removeItem(LEGACY_BLOCKLIST_KEY)]);
}
