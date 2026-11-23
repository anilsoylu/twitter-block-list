// Content script overhead benchmark. Run with `npm run bench`; not part of `test:e2e`.
//
// Every metric runs on the same generated timeline with and without the
// extension; the run without it is the cost of X's own DOM work, so
// overhead = with - without. Each number is the median of RUNS runs after
// WARMUP discarded ones.
//
// BENCH_LIST_FILE: optional newline-separated handle list to seed (else
//   LIST_SIZE generated handles).
// BENCH_PROFILE_DIR: when set, also writes a CPU profile of metrics 1 and 2
//   there and prints the top self-time functions.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { expect, test } from '../e2e/fixtures';

const RUNS = 25;
const WARMUP = 5;
const LIST_SIZE = 3830;
const BATCH = 20;
const PRELOADED = 100;
const RESCAN_POSTS = 300;
const CHURN = 50;

function loadHandles(): string[] {
  const file = process.env.BENCH_LIST_FILE;
  const raw = file && existsSync(file)
    ? readFileSync(file, 'utf8').split(/\r?\n/)
    : Array.from({ length: LIST_SIZE }, (_, i) => `listed_${i}`);
  // Same normalization as parseUsernames, so the fixture's storage check matches.
  const handles = raw.map((line) => line.trim().replace(/^@/, '').toLowerCase());
  return [...new Set(handles.filter((h) => /^[a-z0-9_]{1,15}$/.test(h)))];
}

const HANDLES = loadHandles();
test.use({ listHandles: HANDLES });

// ~20% listed authors, ~20% quote cards (half of them quoting a listed account).
function author(i: number): string {
  return i % 5 === 0 ? HANDLES[(i * 7) % HANDLES.length]! : `reader_${i}`;
}

function quoteCard(i: number): string {
  if (i % 5 !== 2) return '';
  const quoted = i % 10 === 2 ? HANDLES[(i * 13) % HANDLES.length]! : `quoted_${i}`;
  return `<div role="link" tabindex="0"><div><div>
    <div data-testid="User-Name"><div><span>${quoted}</span></div><div><span tabindex="-1">@${quoted}</span></div></div>
    <div data-testid="tweetText"><span>quoted text ${i}</span></div>
    <div role="group"><button data-testid="like" type="button" aria-label="Like card"><span>C</span></button></div>
  </div></div></div>`;
}

function actionButton(id: string): string {
  return `<div><button data-testid="${id}" type="button" aria-label="${id}"><div><div><svg viewBox="0 0 24 24"><g><path d="M0 0h24v24H0z"></path></g></svg></div><div><span><span>12</span></span></div></div></button></div>`;
}

// Mirrors tests/fixtures/post-with-action-bar.html, padded with the wrapper
// divs X nests around every part of a post.
function postHtml(i: number, focal = false): string {
  const a = author(i);
  return `<div data-testid="cellInnerDiv"><div><div>
  <article data-testid="tweet" role="article" tabindex="${focal ? -1 : 0}"><div><div><div>
    <div><div data-testid="Tweet-User-Avatar"><div><a href="/${a}" role="link"><div><img alt=""></div></a></div></div></div>
    <div><div><div data-testid="User-Name">
      <div><a href="/${a}" role="link"><div><span><span>${a}</span></span></div></a></div>
      <div><div><a href="/${a}" role="link" tabindex="-1"><div><span>@${a}</span></div></a></div><div><span>·</span></div>
        <div><a href="/${a}/status/${1000 + i}" role="link"><time datetime="2026-11-20T10:00:00.000Z">Nov 20</time></a></div></div>
    </div></div>
    <div><div data-testid="tweetText" lang="en"><span>post ${i} mentions </span><a href="/someone">@someone</a><span> and </span><a href="/hashtag/ai">#ai</a></div></div>
    ${quoteCard(i)}
    <div><div role="group" aria-label="Post actions">${['reply', 'retweet', 'like', 'bookmark'].map(actionButton).join('')}</div></div>
    </div>
  </div></div></div></article>
</div></div></div>`;
}

function posts(from: number, count: number): string {
  return Array.from({ length: count }, (_, k) => postHtml(from + k)).join('\n');
}

function listedCount(from: number, count: number): number {
  return Array.from({ length: count }, (_, k) => from + k).filter((i) => i % 5 === 0).length;
}

// Cells the filter marks: listed authors plus quote cards of listed accounts.
function filteredCount(from: number, count: number): number {
  return listedCount(from, count) + Array.from({ length: count }, (_, k) => from + k).filter((i) => i % 10 === 2).length;
}

function pageHtml(initial: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Home / X</title></head>
<body><main role="main"><div id="timeline" aria-label="Timeline: Your Home Timeline">${initial}</div></main></body></html>`;
}

// Cross-origin isolation gives performance.now() 5 µs resolution instead of 100 µs.
async function openPage(context: BrowserContext, path: string, initial: string): Promise<Page> {
  // Registered after the fixture's x.com route, so it takes precedence.
  await context.route('https://x.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      headers: { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' },
      body: pageHtml(initial),
    }),
  );
  const page = await context.newPage();
  await page.goto(`https://x.com${path}`);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  return page;
}

interface BatchArgs {
  batch: string;
  runs: number;
  warmup: number;
}

// Metrics 1 and 2: append BATCH cells one by one, as React commits them, then
// let the microtask checkpoint run the MutationObserver callbacks (ours plus
// the follow-up callback for the Notices we insert). Returns elapsed ms per run
// and how many cells were filtered in the last run.
function insertBatches(page: Page, args: BatchArgs): Promise<{ times: number[]; filtered: number }> {
  return page.evaluate(async ({ batch, runs, warmup }) => {
    const timeline = document.getElementById('timeline')!;
    const times: number[] = [];
    let filtered = 0;
    for (let run = 0; run < warmup + runs; run++) {
      const holder = document.createElement('div');
      holder.innerHTML = batch;
      const cells = Array.from(holder.children);
      const start = performance.now();
      for (const cell of cells) timeline.append(cell);
      for (let i = 0; i < 3; i++) await Promise.resolve();
      const end = performance.now();
      if (run >= warmup) times.push(end - start);
      filtered = cells.filter((cell) => cell.querySelector('[data-ai-reply-filter]') || cell.hasAttribute('data-ai-reply-filter')).length;
      for (const cell of cells) cell.remove();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { times, filtered };
  }, args);
}

// Metric 4: rewrite the author link of the first CHURN posts, alternating
// between a listed and an unlisted handle so every run flips their state.
function churnHrefs(page: Page, listed: string): Promise<number[]> {
  return page.evaluate(
    async ({ listed, churn, runs, warmup }) => {
      const links = Array.from(
        document.querySelectorAll('article [data-testid="User-Name"] a[href]:not([tabindex])'),
      ).slice(0, churn);
      const times: number[] = [];
      for (let run = 0; run < warmup + runs; run++) {
        const href = run % 2 ? '/plain_reader' : `/${listed}`;
        const start = performance.now();
        for (const link of links) link.setAttribute('href', href);
        for (let i = 0; i < 3; i++) await Promise.resolve();
        const end = performance.now();
        if (run >= warmup) times.push(end - start);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return times;
    },
    { listed, churn: CHURN, runs: RUNS, warmup: WARMUP },
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const results: Record<string, { with?: number; without?: number }> = {};
function record(metric: string, side: 'with' | 'without', times: number[]): void {
  expect(times).toHaveLength(RUNS);
  (results[metric] ??= {})[side] = median(times);
}

const BATCH_HTML = posts(PRELOADED, BATCH);
const BATCH_FILTERED = filteredCount(PRELOADED, BATCH);
const SCENARIOS = [
  { metric: '1. insert 20 posts, empty /home', path: '/home', initial: '' },
  { metric: '2a. insert 20 posts, 100 on /home', path: '/home', initial: posts(0, PRELOADED) },
  {
    metric: '2b. insert 20 posts, 100 on /status/',
    path: '/reader_1/status/1',
    initial: postHtml(1, true) + posts(0, PRELOADED),
  },
];
const CHURN_METRIC = '4. change 50 author hrefs, 100 posts';

async function measureAll(context: BrowserContext, side: 'with' | 'without'): Promise<void> {
  for (const { metric, path, initial } of SCENARIOS) {
    const page = await openPage(context, path, initial);
    const { times, filtered } = await insertBatches(page, { batch: BATCH_HTML, runs: RUNS, warmup: WARMUP });
    expect(filtered).toBe(side === 'with' ? BATCH_FILTERED : 0);
    record(metric, side, times);
    await page.close();
  }
  const page = await openPage(context, '/home', posts(0, PRELOADED));
  record(CHURN_METRIC, side, await churnHrefs(page, HANDLES[0]!));
  await page.close();
}

// The content script's isolated world, where chrome.storage is reachable from the page.
async function isolatedWorld(cdp: CDPSession): Promise<number> {
  const contexts: { id: number; name: string; auxData?: { type?: string } }[] = [];
  cdp.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context));
  await cdp.send('Runtime.enable');
  const world = contexts.find((c) => c.auxData?.type === 'isolated' && c.name === 'AI Reply Filter for X');
  if (!world) throw new Error(`content script world not found: ${contexts.map((c) => c.name).join(', ')}`);
  return world.id;
}

async function evaluateIn<T>(cdp: CDPSession, contextId: number, expression: string): Promise<T> {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    contextId,
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
  return result.value as T;
}

test.describe.configure({ mode: 'serial' });

test('without the extension', async ({ browser }) => {
  const context = await browser.newContext();
  await measureAll(context, 'without');
  await context.close();
});

test('with the extension', async ({ context, popup }) => {
  void popup;
  await measureAll(context, 'with');

  // Metric 3: a settings write triggers a full rescan. Timed from the
  // storage write until every listed post has switched mode; the floor is the
  // same write round trip for a key nobody watches, so overhead = rescan - floor.
  const listed = listedCount(0, RESCAN_POSTS);
  const page = await openPage(context, '/home', posts(0, RESCAN_POSTS));
  const cdp = await context.newCDPSession(page);
  const world = await isolatedWorld(cdp);
  const rescan = await evaluateIn<{ rescan: number[]; floor: number[] }>(
    cdp,
    world,
    `(async () => {
      const listed = ${listed}, runs = ${RUNS}, warmup = ${WARMUP};
      const done = (mode) => mode === 'hide'
        ? document.querySelectorAll('[data-testid="cellInnerDiv"][data-ai-reply-filter="hidden"]').length === listed
        : document.querySelectorAll('article[data-ai-reply-filter="collapsed"]').length === listed;
      const until = (mode) => new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (!done(mode)) return;
          observer.disconnect();
          resolve(performance.now());
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
      });
      if (!done('collapse')) throw new Error('page not filtered in collapse mode');
      const rescan = [], floor = [];
      for (let run = 0; run < warmup + runs; run++) {
        const mode = run % 2 ? 'collapse' : 'hide';
        const finished = until(mode);
        const start = performance.now();
        await chrome.storage.sync.set({ settings: { enabled: true, mode } });
        const end = await finished;
        if (run >= warmup) rescan.push(end - start);

        const changed = new Promise((resolve) => {
          const listener = (changes) => {
            if (!changes['bench-floor']) return;
            chrome.storage.onChanged.removeListener(listener);
            resolve(performance.now());
          };
          chrome.storage.onChanged.addListener(listener);
        });
        const floorStart = performance.now();
        await chrome.storage.sync.set({ 'bench-floor': run });
        const floorEnd = await changed;
        if (run >= warmup) floor.push(floorEnd - floorStart);
      }
      await chrome.storage.sync.remove('bench-floor');
      return { rescan, floor };
    })()`,
  );
  record('3. settings rescan, 300 posts', 'with', rescan.rescan);
  record('3. settings rescan, 300 posts', 'without', rescan.floor);
  await page.close();

  const rows = Object.entries(results).map(([metric, r]) => ({
    metric,
    'without (ms)': r.without?.toFixed(3),
    'with (ms)': r.with?.toFixed(3),
    'overhead (ms)': r.with !== undefined && r.without !== undefined ? (r.with - r.without).toFixed(3) : undefined,
  }));
  console.log(`list: ${HANDLES.length} handles, median of ${RUNS} runs`);
  console.table(rows);
});

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
}

test('CPU profile of metrics 1 and 2', async ({ context, popup }) => {
  void popup;
  const dir = process.env.BENCH_PROFILE_DIR;
  test.skip(!dir, 'set BENCH_PROFILE_DIR to capture a profile');
  const page = await openPage(context, '/reader_1/status/1', postHtml(1, true) + posts(0, PRELOADED));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 50 });
  await cdp.send('Profiler.start');
  await insertBatches(page, { batch: BATCH_HTML, runs: 400, warmup: 0 });
  const { profile } = await cdp.send('Profiler.stop');
  mkdirSync(dir!, { recursive: true });
  writeFileSync(join(dir!, 'content-script.cpuprofile'), JSON.stringify(profile));

  // Self time per function: samples whose leaf is that node.
  const nodes = new Map((profile.nodes as ProfileNode[]).map((n) => [n.id, n]));
  const self = new Map<string, number>();
  profile.samples!.forEach((id, i) => {
    const { callFrame: f } = nodes.get(id)!;
    const key = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + profile.timeDeltas![i]! / 1000);
  });
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.table(top.map(([fn, ms]) => ({ fn, 'self (ms)': ms.toFixed(1) })));
  await page.close();
});
