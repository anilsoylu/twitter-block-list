import { blocklistItem, type BlocklistState } from './storage';

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

/**
 * Fetches the remote list and persists the result. Never throws: failures are
 * recorded in `lastError` while the previous handles are kept.
 */
export async function syncBlocklist(fetchFn: typeof fetch = fetch): Promise<BlocklistState> {
  const current = await blocklistItem.getValue();
  let next: BlocklistState;

  try {
    const headers: Record<string, string> = {};
    if (current.etag && current.handles.length > 0) headers['If-None-Match'] = current.etag;

    const response = await fetchFn(BLOCKLIST_URL, { cache: 'no-cache', headers });

    if (response.status === 304) {
      next = { ...current, lastSyncedAt: Date.now(), lastError: null };
    } else if (response.status === 200) {
      const handles = parseUsernames(await response.text());
      if (handles.length === 0) throw new Error('Empty or invalid list');
      next = {
        handles,
        etag: response.headers.get('etag'),
        lastSyncedAt: Date.now(),
        lastError: null,
      };
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    next = { ...current, lastError: error instanceof Error ? error.message : String(error) };
  }

  await blocklistItem.setValue(next);
  return next;
}
