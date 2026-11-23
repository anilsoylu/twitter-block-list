import type { RefreshBlocklistMessage } from '@/utils/blocklist';
import {
  allowlistItem,
  blocklistHandlesItem,
  blocklistMetaItem,
  settingsItem,
  type BlocklistMeta,
  type FilterMode,
  type Settings,
} from '@/utils/storage';

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const enabledInput = byId<HTMLInputElement>('enabled');
const modeFieldset = byId<HTMLFieldSetElement>('mode');
const modeInputs = Array.from(modeFieldset.querySelectorAll<HTMLInputElement>('input[name="mode"]'));
const countText = byId<HTMLSpanElement>('count');
const countLabel = byId<HTMLSpanElement>('count-label');
const updatedText = byId<HTMLSpanElement>('updated');
const changeText = byId<HTMLSpanElement>('change');
const errorText = byId<HTMLParagraphElement>('error');
const refreshButton = byId<HTMLButtonElement>('refresh');
const allowlistList = byId<HTMLUListElement>('allowlist');
const allowlistEmpty = byId<HTMLParagraphElement>('allowlist-empty');

function renderSettings(settings: Settings): void {
  enabledInput.checked = settings.enabled;
  modeFieldset.disabled = !settings.enabled;
  for (const input of modeInputs) input.checked = input.value === settings.mode;
}

function renderCount(handles: string[]): void {
  const count = handles.length;
  countText.textContent = count.toLocaleString();
  countLabel.textContent = count === 1 ? 'account filtered' : 'accounts filtered';
}

function renderError(message: string | null): void {
  errorText.hidden = !message;
  errorText.textContent = message ? `Last update failed: ${message}` : '';
}

/** Time only for today, otherwise a short date; the full timestamp goes in the tooltip. */
function formatWhen(at: number): string {
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderMeta(meta: BlocklistMeta): void {
  updatedText.textContent = meta.lastSyncedAt ? `Updated ${formatWhen(meta.lastSyncedAt)}` : 'Not updated yet';
  updatedText.title = meta.lastSyncedAt ? new Date(meta.lastSyncedAt).toLocaleString() : '';
  const change = meta.lastChange;
  changeText.hidden = !change;
  changeText.textContent = change
    ? `Last change +${change.added.toLocaleString()} / \u2212${change.removed.toLocaleString()}`
    : '';
  changeText.title = change ? new Date(change.at).toLocaleString() : '';
  renderError(meta.lastError);
}

function renderAllowlist(handles: string[]): void {
  const items = handles.map((handle) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `@${handle}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button remove-button';
    remove.textContent = '\u00d7';
    remove.setAttribute('aria-label', `Remove @${handle}`);
    remove.addEventListener('click', () => void removeFromAllowlist(handle));
    item.append(name, remove);
    return item;
  });
  allowlistList.replaceChildren(...items);
  allowlistEmpty.hidden = handles.length > 0;
}

async function removeFromAllowlist(handle: string): Promise<void> {
  const handles = await allowlistItem.getValue();
  await allowlistItem.setValue(handles.filter((h) => h !== handle));
}

async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await settingsItem.setValue({ ...(await settingsItem.getValue()), ...patch });
}

enabledInput.addEventListener('change', () => void updateSettings({ enabled: enabledInput.checked }));
for (const input of modeInputs) {
  input.addEventListener('change', () => {
    if (input.checked) void updateSettings({ mode: input.value as FilterMode });
  });
}

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  try {
    const meta: BlocklistMeta = await browser.runtime.sendMessage({
      type: 'refresh-blocklist',
    } satisfies RefreshBlocklistMessage);
    renderMeta(meta);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  } finally {
    refreshButton.disabled = false;
  }
});

settingsItem.watch(renderSettings);
allowlistItem.watch(renderAllowlist);
blocklistHandlesItem.watch(renderCount);
blocklistMetaItem.watch(renderMeta);

void Promise.all([
  settingsItem.getValue(),
  allowlistItem.getValue(),
  blocklistHandlesItem.getValue(),
  blocklistMetaItem.getValue(),
]).then(([settings, allowlist, handles, meta]) => {
  renderSettings(settings);
  renderAllowlist(allowlist);
  renderCount(handles);
  renderMeta(meta);
});
