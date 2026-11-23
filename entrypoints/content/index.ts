import './style.css';
import { normalizeHandle } from '@/utils/blocklist';
import {
  getOutermostTweet,
  NOTIFICATION_SELECTOR,
  TWEET_SELECTOR,
  USER_CELL_SELECTOR,
} from '@/utils/selectors';
import { allowlistItem, blocklistHandlesItem, settingsItem } from '@/utils/storage';
import {
  applyComposerFilter,
  applyFilter,
  applyNotificationFilter,
  applyUserCellFilter,
  clearFilter,
  isNotice,
  shouldBlockShortcut,
  type FilterContext,
} from '@/utils/tweet-filter';

const OWNER_SELECTOR = `${USER_CELL_SELECTOR}, ${NOTIFICATION_SELECTOR}`;
const FILTERABLE_SELECTOR = `${TWEET_SELECTOR}, ${OWNER_SELECTOR}`;

async function addToAllowlist(raw: string): Promise<void> {
  const handle = normalizeHandle(raw);
  if (!handle) return;
  const allowlist = await allowlistItem.getValue();
  if (!allowlist.includes(handle)) await allowlistItem.setValue([...allowlist, handle]);
}

// Adds the filterable element affected by a change at `node`: its outermost
// post, user cell or notification, plus (when `deep`) any inside it.
function collect(node: Element, targets: Set<HTMLElement>, deep: boolean): void {
  const owner = getOutermostTweet(node) ?? node.closest<HTMLElement>(OWNER_SELECTOR);
  if (owner) targets.add(owner);
  if (!deep || !node.firstElementChild) return;
  for (const el of node.querySelectorAll<HTMLElement>(FILTERABLE_SELECTOR)) {
    targets.add(el.matches(TWEET_SELECTOR) ? (getOutermostTweet(el) ?? el) : el);
  }
}

function apply(el: HTMLElement, ctx: FilterContext): void {
  if (el.matches(TWEET_SELECTOR)) applyFilter(el, ctx);
  else if (el.matches(USER_CELL_SELECTOR)) applyUserCellFilter(el, ctx);
  else applyNotificationFilter(el, ctx);
}

function isStatusPage(): boolean {
  return location.pathname.includes('/status/');
}

export default defineContentScript({
  matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  runAt: 'document_start',
  async main(ctx) {
    // Capture phase on window runs before X's own shortcut handlers.
    const onKeydown = (event: KeyboardEvent) => {
      if (!shouldBlockShortcut(event, document.activeElement)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKeydown, true);

    const [settings, allowlist, blocklist] = await Promise.all([
      settingsItem.getValue(),
      allowlistItem.getValue(),
      blocklistHandlesItem.getValue(),
    ]);
    // Mutated in place by the watchers so Notice buttons built earlier see
    // the current values.
    const filterContext: FilterContext = {
      enabled: settings.enabled,
      mode: settings.mode,
      blocklist: new Set(blocklist),
      allowlist: new Set(allowlist),
      onAlwaysShow: (handle) => void addToAllowlist(handle),
    };
    if (ctx.isInvalid) {
      window.removeEventListener('keydown', onKeydown, true);
      return;
    }

    const root = document.documentElement;
    const scan = () => {
      const targets = new Set<HTMLElement>();
      collect(root, targets, true);
      for (const el of targets) apply(el, filterContext);
      applyComposerFilter(document, filterContext);
    };

    // Runs as a microtask before the next layout, so new posts are filtered
    // before they are ever painted or seen by X's visibility tracking.
    const observer = new MutationObserver((mutations) => {
      const targets = new Set<HTMLElement>();
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          // X recycles rows by updating links in place.
          collect(mutation.target as Element, targets, false);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) collect(node, targets, true);
        }
        // A Notice removed by X's re-render leaves its post collapsed with
        // nothing in its place; re-apply to the element that followed it.
        for (const node of mutation.removedNodes) {
          if (!isNotice(node)) continue;
          const next = mutation.nextSibling;
          collect(next instanceof Element ? next : (mutation.target as Element), targets, false);
        }
      }
      for (const el of targets) if (el.isConnected) apply(el, filterContext);
      if (isStatusPage()) applyComposerFilter(document, filterContext);
    });

    const unwatchers = [
      settingsItem.watch((next) => {
        filterContext.enabled = next.enabled;
        filterContext.mode = next.mode;
        scan();
      }),
      allowlistItem.watch((next) => {
        filterContext.allowlist = new Set(next);
        scan();
      }),
      blocklistHandlesItem.watch((next) => {
        filterContext.blocklist = new Set(next);
        scan();
      }),
    ];

    ctx.onInvalidated(() => {
      observer.disconnect();
      window.removeEventListener('keydown', onKeydown, true);
      for (const unwatch of unwatchers) unwatch();
      clearFilter(root);
    });

    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    scan();
  },
});
