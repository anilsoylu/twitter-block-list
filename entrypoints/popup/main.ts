import type { RefreshBlocklistMessage } from '@/utils/blocklist';
import {
  allowlistItem,
  blocklistItem,
  settingsItem,
  type BlocklistState,
  type FilterMode,
  type Settings,
} from '@/utils/storage';

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const enabledInput = byId<HTMLInputElement>('enabled');
const modeFieldset = byId<HTMLFieldSetElement>('mode');
const modeInputs = Array.from(modeFieldset.querySelectorAll<HTMLInputElement>('input[name="mode"]'));
const countText = byId<HTMLParagraphElement>('count');
const updatedText = byId<HTMLParagraphElement>('updated');
const errorText = byId<HTMLParagraphElement>('error');
const refreshButton = byId<HTMLButtonElement>('refresh');
const allowlistList = byId<HTMLUListElement>('allowlist');
const allowlistEmpty = byId<HTMLParagraphElement>('allowlist-empty');

function renderSettings(settings: Settings): void {
  enabledInput.checked = settings.enabled;
  modeFieldset.disabled = !settings.enabled;
  for (const input of modeInputs) input.checked = input.value === settings.mode;
}

function renderBlocklist(state: BlocklistState): void {
  const count = state.handles.length;
  countText.textContent = `${count.toLocaleString()} ${count === 1 ? 'account' : 'accounts'} on the list`;
  updatedText.textContent = state.lastSyncedAt
    ? `Last updated ${new Date(state.lastSyncedAt).toLocaleString()}`
    : 'Last updated never';
  errorText.hidden = !state.lastError;
  errorText.textContent = state.lastError ? `Last update failed: ${state.lastError}` : '';
}

function renderAllowlist(handles: string[]): void {
  const items = handles.map((handle) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `@${handle}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
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
    const state: BlocklistState = await browser.runtime.sendMessage({
      type: 'refresh-blocklist',
    } satisfies RefreshBlocklistMessage);
    renderBlocklist(state);
  } finally {
    refreshButton.disabled = false;
  }
});

settingsItem.watch(renderSettings);
allowlistItem.watch(renderAllowlist);
blocklistItem.watch(renderBlocklist);

void Promise.all([settingsItem.getValue(), allowlistItem.getValue(), blocklistItem.getValue()]).then(
  ([settings, allowlist, blocklist]) => {
    renderSettings(settings);
    renderAllowlist(allowlist);
    renderBlocklist(blocklist);
  },
);
