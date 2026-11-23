// Every X-specific DOM selector lives in this file so markup changes on X
// only need to be fixed in one place. The one exception is the action bar
// selector in entrypoints/content/style.css, which mirrors OWN_ACTION_BAR_SELECTOR.

export const TWEET_SELECTOR = 'article[data-testid="tweet"]';
export const USER_CELL_SELECTOR = '[data-testid="UserCell"]';
export const NOTIFICATION_SELECTOR = '[data-testid="notification"]';
const FOCAL_TWEET_SELECTOR = `${TWEET_SELECTOR}[tabindex="-1"]`;
const CELL_SELECTOR = 'div[data-testid="cellInnerDiv"]';
const USER_NAME_SELECTOR = '[data-testid="User-Name"]';
const TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]';
const QUOTE_CARD_SELECTOR = 'div[role="link"]';
const PROFILE_LINK_SELECTOR = 'a[href^="/"]';
// Prefix match: X numbers the composer textareas (tweetTextarea_0, ...).
const COMPOSER_SELECTOR = '[data-testid^="tweetTextarea"], [data-testid="tweetButtonInline"]';

/** A post's own like/repost/reply/bookmark/share bar, excluding any bar inside its quote card. */
export const OWN_ACTION_BAR_SELECTOR = `[role="group"]:not(${QUOTE_CARD_SELECTOR} [role="group"])`;

const PROFILE_PATH = /^\/([A-Za-z0-9_]{1,15})\/?$/;
const HANDLE_TEXT = /^@([A-Za-z0-9_]{1,15})$/;
const RESERVED_PATHS = new Set([
  'home',
  'explore',
  'i',
  'notifications',
  'messages',
  'search',
  'settings',
  'hashtag',
  'compose',
]);

function handleFromHref(href: string | null): string | null {
  if (!href) return null;
  const handle = PROFILE_PATH.exec(href.split(/[?#]/, 1)[0] ?? '')?.[1]?.toLowerCase();
  if (!handle) return null;
  return RESERVED_PATHS.has(handle) ? null : handle;
}

function handleFromLinks(links: Iterable<Element>): string | null {
  for (const link of links) {
    const handle = handleFromHref(link.getAttribute('href'));
    if (handle) return handle;
  }
  return null;
}

// First text node under `root` that reads exactly "@handle".
function handleFromText(root: Element): string | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const handle = HANDLE_TEXT.exec((node.textContent ?? '').trim())?.[1];
    if (handle) return handle.toLowerCase();
  }
  return null;
}

// True when `el` belongs to `article` itself rather than to a nested
// (unavailable quote) article inside it.
function ownedBy(el: Element, article: Element): boolean {
  return el.closest('article') === article;
}

/** The outermost post article containing `node` (or `node` itself), if any. */
export function getOutermostTweet(node: Element): HTMLElement | null {
  let article = node.closest<HTMLElement>(TWEET_SELECTOR);
  for (let outer = article; outer; outer = outer.parentElement?.closest<HTMLElement>(TWEET_SELECTOR) ?? null) {
    article = outer;
  }
  return article;
}

export function getTweetAuthor(article: Element): string | null {
  const links = Array.from(
    article.querySelectorAll(`${USER_NAME_SELECTOR} ${PROFILE_LINK_SELECTOR}`),
  ).filter((link) => ownedBy(link, article) && !link.closest(QUOTE_CARD_SELECTOR));
  return handleFromLinks(links);
}

export function getQuotedCard(article: Element): HTMLElement | null {
  for (const card of article.querySelectorAll<HTMLElement>(QUOTE_CARD_SELECTOR)) {
    if (ownedBy(card, article) && card.querySelector(USER_NAME_SELECTOR)) return card;
  }
  return null;
}

export function getQuotedAuthor(card: Element): string | null {
  const userName = card.querySelector(USER_NAME_SELECTOR);
  if (!userName) return null;
  return handleFromLinks(userName.querySelectorAll(PROFILE_LINK_SELECTOR)) ?? handleFromText(userName);
}

/** The account shown in a user cell (follow suggestions, user lists, people search). */
export function getUserCellHandle(cell: Element): string | null {
  return handleFromLinks(cell.querySelectorAll(PROFILE_LINK_SELECTOR)) ?? handleFromText(cell);
}

/**
 * Unique handles of the accounts that acted in a notification ("X and Y liked
 * your post"). Links inside the quoted post text or a nested post are mentions,
 * not actors.
 */
export function getNotificationActors(notification: Element): string[] {
  const actors = new Set<string>();
  for (const link of notification.querySelectorAll(PROFILE_LINK_SELECTOR)) {
    const owner = link.closest(`${TWEET_TEXT_SELECTOR}, ${TWEET_SELECTOR}`);
    if (owner && notification.contains(owner)) continue;
    const handle = handleFromHref(link.getAttribute('href'));
    if (handle) actors.add(handle);
  }
  return [...actors];
}

/** The focal post of a status page, which X renders with tabindex="-1". */
export function findFocalPost(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(FOCAL_TWEET_SELECTOR);
}

/** The inline reply composer cells X renders right after the focal post's cell. Best effort. */
export function findComposerCells(focal: Element): HTMLElement[] {
  const cells: HTMLElement[] = [];
  let next = focal.closest(CELL_SELECTOR)?.nextElementSibling ?? null;
  for (let i = 0; i < 2 && next; i++, next = next.nextElementSibling) {
    if (next instanceof HTMLElement && next.matches(CELL_SELECTOR) && next.querySelector(COMPOSER_SELECTOR)) {
      cells.push(next);
    }
  }
  return cells;
}

/** The virtualised timeline row holding `el`, or `el` itself outside a timeline. */
export function getTimelineCell(el: Element): HTMLElement {
  return el.closest<HTMLElement>(CELL_SELECTOR) ?? (el as HTMLElement);
}
