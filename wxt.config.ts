import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'AI Reply Filter for X',
    description: 'Collapse or hide posts on X from accounts listed on blockedforaireply.com.',
    permissions: ['storage', 'alarms'],
    host_permissions: ['https://blockedforaireply.com/*'],
  },
});
