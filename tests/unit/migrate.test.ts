import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { legacyAllowlistMigratedItem, migrateLegacyStorage } from '@/utils/migrate';
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
    expect(await legacyAllowlistMigratedItem.getValue()).toBe(true);
  });

  it('keeps the legacy sync allowlist for older devices and removes the local blocklist', async () => {
    await fakeBrowser.storage.sync.set({ allowlist: ['alice'] });
    await fakeBrowser.storage.local.set({ blocklist: { handles: ['x'], etag: null } });

    await migrateLegacyStorage();

    expect(await fakeBrowser.storage.sync.get('allowlist')).toEqual({ allowlist: ['alice'] });
    expect(await fakeBrowser.storage.local.get('blocklist')).toEqual({});
  });

  it('runs once per device, so a handle removed locally does not come back', async () => {
    await fakeBrowser.storage.sync.set({ allowlist: ['alice', 'bob'] });
    await migrateLegacyStorage();
    await allowlistItem.setValue(['alice']);

    await migrateLegacyStorage();

    expect(await allowlistItem.getValue()).toEqual(['alice']);
  });

  it('leaves the local allowlist untouched without legacy data and still sets the marker', async () => {
    await allowlistItem.setValue(['carol']);

    await migrateLegacyStorage();

    expect(await allowlistItem.getValue()).toEqual(['carol']);
    expect(await fakeBrowser.storage.local.get()).toEqual({
      allowlist: ['carol'],
      'legacy-allowlist-migrated': true,
    });
  });
});
