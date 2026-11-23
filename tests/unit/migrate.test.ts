import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { migrateLegacyStorage } from '@/utils/migrate';
import { allowlistItem } from '@/utils/storage';

describe('migrateLegacyStorage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('merges the sync allowlist into local storage, normalized and deduped', async () => {
    await allowlistItem.setValue(['alice']);
    await fakeBrowser.storage.sync.set({ allowlist: ['@Alice', ' Bob ', 'bob', 'not-a-handle'] });

    await migrateLegacyStorage();

    expect(await allowlistItem.getValue()).toEqual(['alice', 'bob']);
  });

  it('removes the legacy sync allowlist and local blocklist keys', async () => {
    await fakeBrowser.storage.sync.set({ allowlist: ['alice'] });
    await fakeBrowser.storage.local.set({ blocklist: { handles: ['x'], etag: null } });

    await migrateLegacyStorage();

    expect(await fakeBrowser.storage.sync.get('allowlist')).toEqual({});
    expect(await fakeBrowser.storage.local.get('blocklist')).toEqual({});
  });

  it('is idempotent', async () => {
    await fakeBrowser.storage.sync.set({ allowlist: ['alice'] });

    await migrateLegacyStorage();
    await migrateLegacyStorage();

    expect(await allowlistItem.getValue()).toEqual(['alice']);
  });

  it('leaves the local allowlist untouched without legacy data', async () => {
    await allowlistItem.setValue(['carol']);

    await migrateLegacyStorage();

    expect(await allowlistItem.getValue()).toEqual(['carol']);
    expect(await fakeBrowser.storage.local.get()).toEqual({ allowlist: ['carol'] });
  });
});
