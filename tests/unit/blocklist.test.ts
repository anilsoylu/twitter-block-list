import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  BLOCKLIST_URL,
  diffHandles,
  MAX_LIST_BYTES,
  MAX_LIST_HANDLES,
  normalizeHandle,
  parseUsernames,
  syncBlocklist,
} from '@/utils/blocklist';
import { blocklistHandlesItem, blocklistMetaItem, type BlocklistMeta } from '@/utils/storage';

function textResponse(body: string, status = 200, etag?: string): Response {
  const headers = etag ? { etag } : undefined;
  // Response bodies are not allowed for 304, so pass null there.
  return new Response(status === 304 ? null : body, { status, headers });
}

function fakeFetch(...responses: Array<Response | Error>) {
  const fn = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fn.mockRejectedValueOnce(response);
    else fn.mockResolvedValueOnce(response);
  }
  return fn;
}

/** Storage keys written to chrome.storage.local, in order. */
function spyLocalWrites(): string[] {
  const keys: string[] = [];
  const original = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
  vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async (items) => {
    keys.push(...Object.keys(items));
    return original(items);
  });
  return keys;
}

function sentHeaders(fn: ReturnType<typeof fakeFetch>, call: number): Record<string, string> {
  return (fn.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>;
}

describe('normalizeHandle', () => {
  it('trims whitespace, strips a leading @ and lowercases', () => {
    expect(normalizeHandle('  @Alice_01 \t')).toBe('alice_01');
  });

  it('accepts a 15 character handle', () => {
    expect(normalizeHandle('a'.repeat(15))).toBe('a'.repeat(15));
  });

  it.each([
    ['empty', ''],
    ['only @', '@'],
    ['too long', 'a'.repeat(16)],
    ['dash', 'foo-bar'],
    ['dot', 'foo.bar'],
    ['inner space', 'foo bar'],
    ['double @', '@@foo'],
    ['url', 'https://x.com/foo'],
  ])('rejects %s', (_label, raw) => {
    expect(normalizeHandle(raw)).toBeNull();
  });
});

describe('parseUsernames', () => {
  it('handles CRLF, blank lines, case-insensitive duplicates and keeps first-seen order', () => {
    const text = 'Charlie\r\n\r\n@alice\n  \nBOB\r\nalice\ncharlie\ninvalid-handle\n';
    expect(parseUsernames(text)).toEqual(['charlie', 'alice', 'bob']);
  });

  it('returns an empty list for an empty body', () => {
    expect(parseUsernames('')).toEqual([]);
  });
});

describe('diffHandles', () => {
  it('counts added and removed handles', () => {
    expect(diffHandles(['alice', 'bob'], ['bob', 'carol', 'dave'])).toEqual({ added: 2, removed: 1 });
  });

  it('ignores order and duplicates', () => {
    expect(diffHandles(['alice', 'bob', 'bob'], ['bob', 'alice'])).toEqual({ added: 0, removed: 0 });
  });

  it('handles empty lists', () => {
    expect(diffHandles([], ['alice'])).toEqual({ added: 1, removed: 0 });
    expect(diffHandles(['alice'], [])).toEqual({ added: 0, removed: 1 });
  });
});

describe('syncBlocklist', () => {
  const seededMeta: BlocklistMeta = {
    etag: '"v1"',
    lastSyncedAt: 1_000,
    lastError: null,
    lastChange: { added: 2, removed: 0, at: 1_000 },
  };

  async function seed(handles: string[], meta: Partial<BlocklistMeta> = {}): Promise<void> {
    await blocklistHandlesItem.setValue(handles);
    await blocklistMetaItem.setValue({ ...seededMeta, ...meta });
  }

  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('stores lowercase handles and meta with lastChange on the first 200', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const fetchFn = fakeFetch(textResponse('Alice\nBob\n', 200, '"v1"'));

    const result = await syncBlocklist(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(BLOCKLIST_URL, expect.objectContaining({ cache: 'no-cache' }));
    expect(sentHeaders(fetchFn, 0)).not.toHaveProperty('If-None-Match');
    expect(result).toEqual({
      etag: '"v1"',
      lastSyncedAt: 1_000,
      lastError: null,
      lastChange: { added: 2, removed: 0, at: 1_000 },
    });
    expect(await blocklistMetaItem.getValue()).toEqual(result);
    expect(await blocklistHandlesItem.getValue()).toEqual(['alice', 'bob']);
  });

  it('sends If-None-Match and on 304 writes only the meta item', async () => {
    vi.useFakeTimers({ now: 5_000 });
    await seed(['alice', 'bob'], { lastError: 'HTTP 503' });
    const writes = spyLocalWrites();
    const fetchFn = fakeFetch(textResponse('', 304));

    const result = await syncBlocklist(fetchFn);

    expect(sentHeaders(fetchFn, 0)).toEqual({ 'If-None-Match': '"v1"' });
    expect(result).toEqual({ ...seededMeta, lastSyncedAt: 5_000, lastError: null });
    expect(await blocklistMetaItem.getValue()).toEqual(result);
    expect(writes).toEqual(['blocklist-meta']);
    expect(await blocklistHandlesItem.getValue()).toEqual(['alice', 'bob']);
  });

  it('does not send If-None-Match when no handles are stored', async () => {
    await seed([]);
    const fetchFn = fakeFetch(textResponse('alice', 200, '"v2"'));

    await syncBlocklist(fetchFn);

    expect(sentHeaders(fetchFn, 0)).not.toHaveProperty('If-None-Match');
  });

  it('on a 200 with the same set in another order and case, writes meta only and keeps lastChange', async () => {
    vi.useFakeTimers({ now: 9_000 });
    await seed(['alice', 'bob']);
    const writes = spyLocalWrites();

    const result = await syncBlocklist(fakeFetch(textResponse('BOB\n@Alice\n', 200, '"v2"')));

    expect(result).toEqual({ ...seededMeta, etag: '"v2"', lastSyncedAt: 9_000 });
    expect(writes).toEqual(['blocklist-meta']);
    expect(await blocklistHandlesItem.getValue()).toEqual(['alice', 'bob']);
  });

  it('on a 200 with changes, replaces the handles and records lastChange', async () => {
    vi.useFakeTimers({ now: 9_000 });
    await seed(['alice', 'bob']);
    const writes = spyLocalWrites();

    const result = await syncBlocklist(fakeFetch(textResponse('bob\ncarol\ndave\n', 200, '"v2"')));

    expect(result.lastChange).toEqual({ added: 2, removed: 1, at: 9_000 });
    expect(result.etag).toBe('"v2"');
    expect(await blocklistHandlesItem.getValue()).toEqual(['bob', 'carol', 'dave']);
    expect(writes).toEqual(['blocklist-handles', 'blocklist-meta']);
  });

  describe('keeps the previous handles and records lastError', () => {
    beforeEach(async () => {
      await seed(['alice']);
    });

    it.each([
      ['an empty 200 body', () => textResponse('', 200, '"v2"'), 'Empty or invalid list'],
      [
        'an HTML-ish 200 body',
        () => textResponse('<!doctype html>\n<html><body>Error</body></html>', 200, '"v2"'),
        'Empty or invalid list',
      ],
      [
        'a Content-Length over the size cap',
        () => new Response('bob', { headers: { 'content-length': String(MAX_LIST_BYTES + 1) } }),
        'List too large',
      ],
      ['a body over the size cap', () => textResponse('bob\n'.repeat(MAX_LIST_BYTES / 4 + 1)), 'List too large'],
      [
        'more handles than the cap',
        () => textResponse(Array.from({ length: MAX_LIST_HANDLES + 1 }, (_, i) => `h${i}`).join('\n')),
        'Too many handles',
      ],
      ['a 503', () => textResponse('Service Unavailable', 503), 'HTTP 503'],
      ['a network error', () => new TypeError('Failed to fetch'), 'Failed to fetch'],
    ])('on %s', async (_label, makeResponse, message) => {
      const writes = spyLocalWrites();

      const result = await syncBlocklist(fakeFetch(makeResponse()));

      expect(result).toEqual({ ...seededMeta, lastError: message });
      expect(await blocklistMetaItem.getValue()).toEqual(result);
      expect(await blocklistHandlesItem.getValue()).toEqual(['alice']);
      expect(writes).toEqual(['blocklist-meta']);
    });
  });
});
