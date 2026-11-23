import type { Page } from '@playwright/test';
import { expect, readStorage, test } from './fixtures';

const PLACEHOLDER = '.ai-reply-filter-placeholder';

function cellFor(page: Page, statusPath: string) {
  return page.locator('[data-testid="cellInnerDiv"]', { has: page.locator(`a[href="${statusPath}"]`) });
}

function postFor(page: Page, statusPath: string) {
  return cellFor(page, statusPath).locator('article[data-testid="tweet"]');
}

async function openTimeline(page: Page): Promise<void> {
  await page.goto('https://x.com/home');
  await expect(postFor(page, '/alice/status/111').locator(PLACEHOLDER)).toBeVisible();
}

async function appendAlicePost(page: Page): Promise<void> {
  await page.evaluate(() => {
    const source = document.querySelector('[data-testid="cellInnerDiv"]')!;
    const cell = source.cloneNode(true) as HTMLElement;
    // Strip anything the content script added to the source cell.
    cell.querySelectorAll('.ai-reply-filter-placeholder').forEach((el) => el.remove());
    cell.querySelectorAll('*').forEach((el) => {
      el.classList.remove('ai-reply-filter-collapsed', 'ai-reply-filter-hidden');
      el.removeAttribute('data-ai-reply-filter-state');
    });
    cell.querySelector('a[href="/alice/status/111"]')!.setAttribute('href', '/alice/status/444');
    cell.querySelector('[data-testid="tweetText"] span')!.textContent = 'alice posts again';
    document.querySelector('[aria-label="Timeline: Your Home Timeline"]')!.append(cell);
  });
}

test('collapses listed authors and quoted posts, including posts added later', async ({ context, popup }) => {
  void popup;
  const page = await context.newPage();
  await openTimeline(page);

  const alice = postFor(page, '/alice/status/111');
  await expect(alice.locator(`${PLACEHOLDER} > span`)).toHaveText('Post from @alice hidden (AI reply list)');
  await expect(alice.getByText('alice says hello')).toBeHidden();

  const bob = postFor(page, '/bob/status/222');
  await expect(bob.getByText('bob says hello')).toBeVisible();
  await expect(bob.locator(PLACEHOLDER)).toHaveCount(0);

  const quote = postFor(page, '/bob/status/333');
  await expect(quote.getByText('bob quotes something')).toBeVisible();
  await expect(quote.locator(`div[role="link"] > ${PLACEHOLDER} > span`)).toHaveText(
    'Quoted post from @quoted hidden (AI reply list)',
  );
  await expect(quote.getByText('quoted text')).toBeHidden();

  await appendAlicePost(page);
  const dynamic = postFor(page, '/alice/status/444');
  await expect(dynamic.locator(PLACEHOLDER)).toBeVisible();
  await expect(dynamic.getByText('alice posts again')).toBeHidden();
  await expect(dynamic.locator(PLACEHOLDER)).toHaveCount(1);
});

test('Show reveals a collapsed post', async ({ context, popup }) => {
  void popup;
  const page = await context.newPage();
  await openTimeline(page);

  const alice = postFor(page, '/alice/status/111');
  await alice.getByRole('button', { name: 'Show', exact: true }).click();

  await expect(alice.locator(PLACEHOLDER)).toHaveCount(0);
  await expect(alice.getByText('alice says hello')).toBeVisible();
  expect(page.url()).toBe('https://x.com/home');
});

test('hide mode from the popup removes the whole timeline cell', async ({ context, popup }) => {
  const page = await context.newPage();
  await openTimeline(page);

  await popup.getByLabel('Hide completely').check();

  await expect(cellFor(page, '/alice/status/111')).toHaveCSS('display', 'none');
  await expect(cellFor(page, '/bob/status/222')).toBeVisible();
  await expect(page.locator(PLACEHOLDER)).toHaveCount(1); // only the quote card stays collapsed
});

test('Always show adds the author to the allowlist and un-collapses the post', async ({ context, popup }) => {
  const page = await context.newPage();
  await openTimeline(page);

  const alice = postFor(page, '/alice/status/111');
  await alice.getByRole('button', { name: 'Always show @alice' }).click();

  await expect
    .poll(() => readStorage(popup, 'sync', 'allowlist'))
    .toEqual(['alice']);
  await expect(alice.locator(PLACEHOLDER)).toHaveCount(0);
  await expect(alice.getByText('alice says hello')).toBeVisible();
  await expect(popup.getByText('@alice', { exact: true })).toBeVisible();
});
