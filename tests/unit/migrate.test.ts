import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { syncBlocklist } from '@/utils/blocklist';
import { legacyAllowlistMigratedItem, migrateLegacyStorage, migrateThenSync } from '@/utils/migrate';
import { allowlistItem } from '@/utils/storage';

vi.mock('@/utils/blocklist', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/blocklist')>()),
  syncBlocklist: vi.fn(),
}));

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

  it('leaves the local allowlist untouched without legacy data and does not set the marker', async () => {
    await allowlistItem.setValue(['carol']);

    await migrateLegacyStorage();

    expect(await allowlistItem.getValue()).toEqual(['carol']);
    expect(await fakeBrowser.storage.local.get()).toEqual({ allowlist: ['carol'] });
  });

  it('merges legacy data that arrives after a run that found none', async () => {
    await allowlistItem.setValue(['carol']);
    await migrateLegacyStorage();
    await fakeBrowser.storage.sync.set({ allowlist: ['dave'] });

    await migrateLegacyStorage();

    expect(await allowlistItem.getValue()).toEqual(['carol', 'dave']);
    expect(await legacyAllowlistMigratedItem.getValue()).toBe(true);
  });
});

describe('migrateThenSync', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.mocked(syncBlocklist).mockReset();
  });

  it('still syncs when the migration throws', async () => {
    vi.spyOn(legacyAllowlistMigratedItem, 'getValue').mockRejectedValueOnce(new Error('boom'));

    await expect(migrateThenSync()).rejects.toThrow('boom');

    expect(syncBlocklist).toHaveBeenCalledOnce();
  });
});
