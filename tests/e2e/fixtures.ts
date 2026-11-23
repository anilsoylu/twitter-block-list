import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';

const EXTENSION_PATH = fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url));
const TIMELINE_HTML = readFileSync(new URL('../fixtures/x-timeline.html', import.meta.url), 'utf8');

export const BLOCKLIST_URL = 'https://blockedforaireply.com/api/usernames.txt';
export const LISTED_HANDLES = ['alice', 'quoted'];

type StorageArea = 'local' | 'sync';
interface ChromeStorageGlobal {
  chrome: { storage: Record<StorageArea, { get(key: string): Promise<Record<string, unknown>> }> };
}

/** Reads a raw chrome.storage value from an extension page. */
export function readStorage(page: Page, area: StorageArea, key: string): Promise<unknown> {
  return page.evaluate(
    async ([area, key]) => (await (globalThis as unknown as ChromeStorageGlobal).chrome.storage[area].get(key))[key],
    [area, key] as const,
  );
}

export const test = base.extend<{ context: BrowserContext; extensionId: string; popup: Page }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Unrouted requests (including the install-time sync that runs before
        // routes exist) fail instead of reaching the real hosts.
        '--host-resolver-rules=MAP blockedforaireply.com ~NOTFOUND, MAP x.com ~NOTFOUND',
      ],
    });
    await context.route(BLOCKLIST_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/plain',
        headers: { etag: '"e2e-v1"' },
        body: LISTED_HANDLES.join('\n'),
      }),
    );
    await context.route('https://x.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: TIMELINE_HTML }),
    );
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
  // Popup page with the routed list already synced into storage.
  popup: async ({ context, extensionId }, use) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('button', { name: 'Update now' }).click();
    await expect
      .poll(async () => ((await readStorage(popup, 'local', 'blocklist')) as { handles?: string[] } | undefined)?.handles)
      .toEqual(LISTED_HANDLES);
    await use(popup);
  },
});

export { expect };
