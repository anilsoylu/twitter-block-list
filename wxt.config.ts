import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'AI Reply Filter for X',
    description: 'Collapse or hide posts on X from accounts listed on blockedforaireply.com.',
    permissions: ['storage', 'alarms'],
    host_permissions: ['https://blockedforaireply.com/*'],
    // WXT fills `icons` from public/icon/<size>.png but leaves the toolbar icon to the manifest.
    action: {
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    },
  },
});
