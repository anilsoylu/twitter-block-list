import { blocklistHandlesItem, blocklistMetaItem, type BlocklistMeta } from './storage';

export const BLOCKLIST_URL = 'https://blockedforaireply.com/api/usernames.txt';

export interface RefreshBlocklistMessage {
  type: 'refresh-blocklist';
}

const HANDLE_PATTERN = /^[a-z0-9_]{1,15}$/;

export function normalizeHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@/, '').toLowerCase();
  return HANDLE_PATTERN.test(handle) ? handle : null;
}

export function parseUsernames(text: string): string[] {
  const handles = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const handle = normalizeHandle(line);
    if (handle) handles.add(handle);
  }
  return [...handles];
}

export function diffHandles(
  previous: readonly string[],
  next: readonly string[],
): { added: number; removed: number } {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  let added = 0;
  let removed = 0;
  for (const handle of nextSet) if (!previousSet.has(handle)) added++;
  for (const handle of previousSet) if (!nextSet.has(handle)) removed++;
  return { added, removed };
}

/**
 * Fetches the remote list and persists the result. Never throws: failures are
 * recorded in `lastError` while the previous handles are kept. The handle list
 * is only written when its contents change.
 */
export async function syncBlocklist(fetchFn: typeof fetch = fetch): Promise<BlocklistMeta> {
  const [handles, meta] = await Promise.all([blocklistHandlesItem.getValue(), blocklistMetaItem.getValue()]);
  let next: BlocklistMeta;

  try {
    const headers: Record<string, string> = {};
    if (meta.etag && handles.length > 0) headers['If-None-Match'] = meta.etag;

    const response = await fetchFn(BLOCKLIST_URL, { cache: 'no-cache', headers });

    if (response.status === 304) {
      next = { ...meta, lastSyncedAt: Date.now(), lastError: null };
    } else if (response.status === 200) {
      const fetched = parseUsernames(await response.text());
      if (fetched.length === 0) throw new Error('Empty or invalid list');
      const now = Date.now();
      const { added, removed } = diffHandles(handles, fetched);
      const changed = added + removed > 0;
      if (changed) await blocklistHandlesItem.setValue(fetched);
      next = {
        etag: response.headers.get('etag'),
        lastSyncedAt: now,
        lastError: null,
        lastChange: changed ? { added, removed, at: now } : meta.lastChange,
      };
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    next = { ...meta, lastError: error instanceof Error ? error.message : String(error) };
  }

  await blocklistMetaItem.setValue(next);
  return next;
}
