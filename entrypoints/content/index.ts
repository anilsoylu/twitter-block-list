export default defineContentScript({
  matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  main() {},
});
