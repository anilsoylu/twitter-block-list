import type { Page } from '@playwright/test';
import { expect, LISTED_HANDLES, readStorage, test, type ChromeStorageGlobal } from './fixtures';

const NOTICE = '.ai-reply-filter-notice';

function cellFor(page: Page, statusPath: string) {
  return page.locator('[data-testid="cellInnerDiv"]', { has: page.locator(`a[href="${statusPath}"]`) });
}

function postFor(page: Page, statusPath: string) {
  return cellFor(page, statusPath).locator('article[data-testid="tweet"]');
}

// The Notice is the previous sibling of the post it replaces.
function noticeFor(page: Page, statusPath: string) {
  return cellFor(page, statusPath).locator(`${NOTICE}:has(+ article[data-testid="tweet"])`);
}

async function openTimeline(page: Page): Promise<void> {
  await page.goto('https://x.com/home');
  await expect(noticeFor(page, '/alice/status/111')).toBeVisible();
}

test('collapses listed authors and quoted posts, including posts added later', async ({ context, popup }) => {
  void popup;
  const page = await context.newPage();
  await openTimeline(page);

  const alice = postFor(page, '/alice/status/111');
  await expect(noticeFor(page, '/alice/status/111')).toContainText('Hidden: listed AI reply account@alice');
  await expect(alice).toHaveAttribute('data-ai-reply-filter', 'collapsed');
  await expect(alice).toBeHidden();

  const bob = postFor(page, '/bob/status/222');
  await expect(bob.getByText('bob says hello')).toBeVisible();
  await expect(cellFor(page, '/bob/status/222').locator(NOTICE)).toHaveCount(0);

  const quote = postFor(page, '/bob/status/333');
  await expect(quote.getByText('bob quotes something')).toBeVisible();
  await expect(quote.locator(`${NOTICE}:has(+ div[role="link"])`)).toContainText('Hidden quote: listed AI reply account');
  await expect(quote.getByText('quoted text')).toBeHidden();
});

test('a post added later is display:none before the next layout', async ({ context, popup }) => {
  void popup;
  const page = await context.newPage();
  await openTimeline(page);

  const display = await page.evaluate(async () => {
    const cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    cell.innerHTML = `<div><article data-testid="tweet" role="article" tabindex="0">
      <div data-testid="User-Name"><a href="/alice" role="link">Alice</a><a href="/alice/status/444">t</a></div>
      <div data-testid="tweetText"><span>alice posts again</span></div></article></div>`;
    document.querySelector('[aria-label="Timeline: Your Home Timeline"]')!.append(cell);
    // MutationObserver callbacks are microtasks queued before this one.
    await Promise.resolve();
    return getComputedStyle(cell.querySelector('article')!).display;
  });

  expect(display).toBe('none');
  await expect(noticeFor(page, '/alice/status/444')).toHaveCount(1);
});

test('a className overwrite by X keeps the post collapsed', async ({ context, popup }) => {
  void popup;
  const page = await context.newPage();
  await openTimeline(page);

  const display = await postFor(page, '/alice/status/111').evaluate(async (article: HTMLElement) => {
    article.className = 'css-175oi2r r-18u37iz';
    await Promise.resolve();
    return getComputedStyle(article).display;
  });

  expect(display).toBe('none');
});

test('in a flex-row parent the Notice is a single full-width row', async ({ context, popup }) => {
  void popup;
  const page = await context.newPage();
  await openTimeline(page);

  const notice = noticeFor(page, '/alice/status/555');
  await expect(notice).toBeVisible();
  await expect(postFor(page, '/alice/status/555')).toBeHidden();
  const noticeBox = (await notice.boundingBox())!;
  const rowBox = (await page.getByTestId('discover-row').boundingBox())!;
  expect(Math.abs(noticeBox.width - rowBox.width)).toBeLessThanOrEqual(1);
  expect(noticeBox.height).toBeLessThan(60);
});

test('Show reveals the post under an Engagement lock', async ({ context, popup }) => {
  void popup;
  const page = await context.newPage();
  await openTimeline(page);

  const alice = postFor(page, '/alice/status/111');
  await noticeFor(page, '/alice/status/111').getByRole('button', { name: 'Show this post from @alice' }).click();

  await expect(alice.getByText('alice says hello')).toBeVisible();
  await expect(alice).toHaveAttribute('data-ai-reply-filter', 'locked');
  await expect(noticeFor(page, '/alice/status/111')).toHaveClass(/ai-reply-filter-notice-lock/);
  await expect(noticeFor(page, '/alice/status/111')).toContainText('Interactions disabled');
  expect(page.url()).toBe('https://x.com/home');

  await expect(alice.locator('#id__alice [data-testid="like"]')).toHaveCSS('pointer-events', 'none');
  // The quote card's bar is not the post's own and stays interactive.
  await expect(alice.locator('#id__alice_card [data-testid="like"]')).toHaveCSS('pointer-events', 'auto');

  await alice.focus();
  await page.keyboard.press('l');
  await page.keyboard.press('Shift+B');
  await page.keyboard.press('j');
  expect(await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)).toEqual(['Shift', 'j']);
});

test('user cells and notifications of listed accounts are hidden', async ({ context, popup }) => {
  const page = await context.newPage();
  await openTimeline(page);
  await popup.locator('label.segment', { hasText: 'Remove completely' }).click();
  await expect(cellFor(page, '/alice/status/111')).toHaveCSS('display', 'none');

  const userCell = (handle: string) =>
    page.locator('[data-testid="cellInnerDiv"]', { has: page.locator(`[data-testid="UserCell"] a[href="/${handle}"]`) });
  await expect(userCell('alice')).toHaveAttribute('data-ai-reply-filter', 'hidden');
  await expect(userCell('alice')).toBeHidden();
  await expect(userCell('bob')).toBeVisible();

  const notification = (label: string) =>
    page.locator('[data-testid="cellInnerDiv"]', { has: page.getByLabel(label, { exact: true }) });
  await expect(notification('listed likes')).toBeHidden();
  await expect(notification('mixed likes')).toBeVisible();
});

test('hide mode from the popup removes the whole timeline cell', async ({ context, popup }) => {
  const page = await context.newPage();
  await openTimeline(page);

  await popup.locator('label.segment', { hasText: 'Remove completely' }).click();

  await expect(popup.locator('input[name="mode"][value="hide"]')).toBeChecked();
  await expect.poll(() => readStorage(popup, 'sync', 'settings')).toEqual({ enabled: true, mode: 'hide' });
  await expect(cellFor(page, '/alice/status/111')).toHaveCSS('display', 'none');
  await expect(cellFor(page, '/alice/status/555')).toHaveCSS('display', 'none');
  await expect(cellFor(page, '/bob/status/222')).toBeVisible();
  await expect(page.locator(NOTICE)).toHaveCount(1); // only the quote card stays collapsed
});

test('Always show adds the author to the allowlist and un-collapses the post', async ({ context, popup }) => {
  const page = await context.newPage();
  await openTimeline(page);

  const alice = postFor(page, '/alice/status/111');
  await noticeFor(page, '/alice/status/111').getByRole('button', { name: 'Always show @alice' }).click();

  await expect.poll(() => readStorage(popup, 'local', 'allowlist')).toEqual(['alice']);
  await expect(cellFor(page, '/alice/status/111').locator(NOTICE)).toHaveCount(0);
  await expect(alice.getByText('alice says hello')).toBeVisible();
  await expect(popup.getByText('@alice', { exact: true })).toBeVisible();
});

test('a 304 sync from the popup writes only the meta item', async ({ popup, listResponses }) => {
  const before = (await readStorage(popup, 'local', 'blocklist-meta')) as { lastSyncedAt: number };
  await popup.evaluate(() => {
    const w = window as unknown as { __changed: string[] } & ChromeStorageGlobal;
    w.__changed = [];
    w.chrome.storage.local.onChanged.addListener((changes) => w.__changed.push(...Object.keys(changes)));
  });

  await popup.getByRole('button', { name: 'Update now' }).click();

  await expect
    .poll(async () => ((await readStorage(popup, 'local', 'blocklist-meta')) as { lastSyncedAt: number }).lastSyncedAt)
    .toBeGreaterThan(before.lastSyncedAt);
  expect(listResponses.at(-1)).toBe(304);
  // syncBlocklist writes the handles before the meta, so a handles change would already be recorded.
  await expect
    .poll(() => popup.evaluate(() => (window as unknown as { __changed: string[] }).__changed))
    .toEqual(['blocklist-meta']);
  expect(await readStorage(popup, 'local', 'blocklist-handles')).toEqual(LISTED_HANDLES);
  await expect(popup.locator('#error')).toBeHidden();
});

test('popup shows the list size and switches the mode', async ({ popup }) => {
  await expect(popup.locator('#count')).toHaveText(String(LISTED_HANDLES.length));
  await expect(popup.locator('#count-label')).toHaveText('accounts filtered');
  await expect(popup.locator('#updated')).toHaveText(/^Updated /);
  await expect(popup.locator('#change')).toHaveText('Last change +2 / −0');
  await expect(popup.locator('input[name="mode"][value="collapse"]')).toBeChecked();

  await popup.locator('label.segment', { hasText: 'Show a notice' }).click();
  await popup.locator('label.segment', { hasText: 'Remove completely' }).click();
  await expect.poll(() => readStorage(popup, 'sync', 'settings')).toEqual({ enabled: true, mode: 'hide' });

  await popup.locator('label.segment', { hasText: 'Show a notice' }).click();
  await expect.poll(() => readStorage(popup, 'sync', 'settings')).toEqual({ enabled: true, mode: 'collapse' });
});
