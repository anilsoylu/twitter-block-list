import './style.css';
import { normalizeHandle } from '@/utils/blocklist';
import { TWEET_SELECTOR } from '@/utils/selectors';
import { allowlistItem, blocklistItem, settingsItem } from '@/utils/storage';
import { applyFilter, clearFilter, type FilterContext } from '@/utils/tweet-filter';

async function addToAllowlist(raw: string): Promise<void> {
  const handle = normalizeHandle(raw);
  if (!handle) return;
  const allowlist = await allowlistItem.getValue();
  if (!allowlist.includes(handle)) await allowlistItem.setValue([...allowlist, handle]);
}

async function loadContext(): Promise<FilterContext> {
  const [settings, allowlist, blocklist] = await Promise.all([
    settingsItem.getValue(),
    allowlistItem.getValue(),
    blocklistItem.getValue(),
  ]);
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    blocklist: new Set(blocklist.handles),
    allowlist: new Set(allowlist),
    onAlwaysShow: (handle) => void addToAllowlist(handle),
  };
}

// Top-level post articles in `root`, including `root` itself. Articles nested
// in another article (unavailable quotes) are handled by their parent.
function findArticles(root: Element): HTMLElement[] {
  const articles = Array.from(root.querySelectorAll<HTMLElement>(TWEET_SELECTOR));
  if (root.matches(TWEET_SELECTOR)) articles.push(root as HTMLElement);
  return articles.filter((article) => !article.parentElement?.closest('article'));
}

function outermostArticle(node: Element): Element | null {
  let article = node.closest(TWEET_SELECTOR);
  for (let outer = article; outer; outer = outer.parentElement?.closest(TWEET_SELECTOR) ?? null) {
    article = outer;
  }
  return article;
}

export default defineContentScript({
  matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  async main(ctx) {
    let filterContext = await loadContext();
    if (ctx.isInvalid) return;

    const scan = (root: Element) => {
      for (const article of findArticles(root)) applyFilter(article, filterContext);
    };

    const pending = new Set<Element>();
    let frame: number | null = null;

    const flush = () => {
      frame = null;
      const roots = [...pending];
      pending.clear();
      for (const root of roots) if (root.isConnected) scan(root);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          // X recycles cells by swapping children, so a node added inside an
          // article means its outermost article needs another pass.
          pending.add(outermostArticle(node) ?? node);
        }
      }
      if (pending.size > 0 && frame === null) frame = requestAnimationFrame(flush);
    });

    const rescan = async () => {
      filterContext = await loadContext();
      if (!ctx.isInvalid) scan(document.body);
    };
    const unwatchers = [
      settingsItem.watch(rescan),
      allowlistItem.watch(rescan),
      blocklistItem.watch(rescan),
    ];

    ctx.onInvalidated(() => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      for (const unwatch of unwatchers) unwatch();
      clearFilter(document.body);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    scan(document.body);
  },
});
