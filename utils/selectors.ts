// Every X-specific DOM selector lives in this file so markup changes on X
// only need to be fixed in one place.

export const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const CELL_SELECTOR = 'div[data-testid="cellInnerDiv"]';
const USER_NAME_SELECTOR = '[data-testid="User-Name"]';
const QUOTE_CARD_SELECTOR = 'div[role="link"]';
const PROFILE_LINK_SELECTOR = 'a[href^="/"]';

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

// True when `el` belongs to `article` itself rather than to a nested
// (unavailable quote) article inside it.
function ownedBy(el: Element, article: Element): boolean {
  return el.closest('article') === article;
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
  const fromLinks = handleFromLinks(userName.querySelectorAll(PROFILE_LINK_SELECTOR));
  if (fromLinks) return fromLinks;
  const doc = userName.ownerDocument;
  const walker = doc.createTreeWalker(userName, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const handle = HANDLE_TEXT.exec((node.textContent ?? '').trim())?.[1];
    if (handle) return handle.toLowerCase();
  }
  return null;
}

export function getTimelineCell(article: Element): HTMLElement {
  return article.closest<HTMLElement>(CELL_SELECTOR) ?? (article as HTMLElement);
}
