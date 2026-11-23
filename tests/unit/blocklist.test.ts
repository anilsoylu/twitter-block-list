import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BLOCKLIST_URL, normalizeHandle, parseUsernames, syncBlocklist } from '@/utils/blocklist';
import { blocklistItem } from '@/utils/storage';

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

describe('syncBlocklist', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useRealTimers();
  });

  it('stores lowercase handles, etag, lastSyncedAt and clears lastError on 200', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const fetchFn = fakeFetch(textResponse('Alice\nBob\n', 200, '"v1"'));

    const result = await syncBlocklist(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(BLOCKLIST_URL, expect.objectContaining({ cache: 'no-cache' }));
    expect(sentHeaders(fetchFn, 0)).not.toHaveProperty('If-None-Match');
    const expected = { handles: ['alice', 'bob'], etag: '"v1"', lastSyncedAt: 1_000, lastError: null };
    expect(result).toEqual(expected);
    expect(await blocklistItem.getValue()).toEqual(expected);
  });

  it('sends If-None-Match on the next call and keeps handles on 304', async () => {
    vi.useFakeTimers({ now: 1_000 });
    const fetchFn = fakeFetch(textResponse('alice\n', 200, '"v1"'), textResponse('', 304));
    await syncBlocklist(fetchFn);

    vi.setSystemTime(5_000);
    const result = await syncBlocklist(fetchFn);

    expect(sentHeaders(fetchFn, 1)).toEqual({ 'If-None-Match': '"v1"' });
    expect(result).toEqual({ handles: ['alice'], etag: '"v1"', lastSyncedAt: 5_000, lastError: null });
    expect(await blocklistItem.getValue()).toEqual(result);
  });

  it('clears a previous lastError after a 304', async () => {
    await blocklistItem.setValue({ handles: ['alice'], etag: '"v1"', lastSyncedAt: 1, lastError: 'HTTP 503' });

    const result = await syncBlocklist(fakeFetch(textResponse('', 304)));

    expect(result.lastError).toBeNull();
    expect(result.handles).toEqual(['alice']);
  });

  it('does not send If-None-Match when no handles are stored', async () => {
    await blocklistItem.setValue({ handles: [], etag: '"v1"', lastSyncedAt: 1, lastError: null });
    const fetchFn = fakeFetch(textResponse('alice', 200, '"v2"'));

    await syncBlocklist(fetchFn);

    expect(sentHeaders(fetchFn, 0)).not.toHaveProperty('If-None-Match');
  });

  describe('keeps the previous list and records lastError', () => {
    const previous = { handles: ['alice'], etag: '"v1"', lastSyncedAt: 1_000, lastError: null };

    beforeEach(async () => {
      await blocklistItem.setValue(previous);
    });

    it.each([
      ['an empty 200 body', () => textResponse('', 200, '"v2"'), 'Empty or invalid list'],
      [
        'an HTML-ish 200 body',
        () => textResponse('<!doctype html>\n<html><body>Error</body></html>', 200, '"v2"'),
        'Empty or invalid list',
      ],
      ['a 503', () => textResponse('Service Unavailable', 503), 'HTTP 503'],
      ['a network error', () => new TypeError('Failed to fetch'), 'Failed to fetch'],
    ])('on %s', async (_label, makeResponse, message) => {
      const result = await syncBlocklist(fakeFetch(makeResponse()));

      expect(result).toEqual({ ...previous, lastError: message });
      expect(await blocklistItem.getValue()).toEqual(result);
    });
  });
});
