import type { FilterMode } from './storage';
import {
  findComposerCells,
  findFocalPost,
  getNotificationActors,
  getOutermostTweet,
  getQuotedAuthor,
  getQuotedCard,
  getTimelineCell,
  getTweetAuthor,
  getUserCellHandle,
} from './selectors';

export interface FilterContext {
  enabled: boolean;
  mode: FilterMode;
  blocklist: ReadonlySet<string>;
  allowlist: ReadonlySet<string>;
  onAlwaysShow: (handle: string) => void;
}

type FilterState = 'collapsed' | 'hidden' | 'locked';
type NoticeVariant = 'post' | 'quote' | 'lock';

// State lives in attributes we own: X (react-native-web) rewrites `className`
// on re-render but leaves unknown attributes alone.
const FILTER_ATTR = 'data-ai-reply-filter';
const STATE_ATTR = 'data-ai-reply-filter-state';
const REVEALED_ATTR = 'data-ai-reply-filter-revealed';
const HANDLE_ATTR = 'data-ai-reply-filter-handle';
const COMPOSER_STATE = 'composer';
const NOTICE_CLASS = 'ai-reply-filter-notice';
const SVG_NS = 'http://www.w3.org/2000/svg';
const BLOCKED_SHORTCUTS = new Set(['l', 'r', 't', 'b', 's']);
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

interface Treatment {
  target: HTMLElement;
  state: FilterState;
  handle: string;
  notice: NoticeVariant | null;
}

export function isBlocked(
  handle: string | null,
  ctx: Pick<FilterContext, 'blocklist' | 'allowlist'>,
): handle is string {
  return handle !== null && ctx.blocklist.has(handle) && !ctx.allowlist.has(handle);
}

// Removes our Notices, filter attributes and state from `root` and its
// descendants. The per-element "revealed" marker is kept on purpose so a
// re-scan after a settings or list change does not collapse posts the user
// chose to show.
export function clearFilter(root: ParentNode): void {
  for (const el of root.querySelectorAll(`.${NOTICE_CLASS}`)) el.remove();
  const marked = Array.from(root.querySelectorAll(`[${FILTER_ATTR}], [${STATE_ATTR}]`));
  if (root instanceof Element) marked.push(root);
  for (const el of marked) {
    el.removeAttribute(FILTER_ATTR);
    el.removeAttribute(STATE_ATTR);
  }
}

// Drops a "revealed" marker left over from a different author (recycled node)
// and reports whether `el` is currently revealed for `handle`.
function isRevealed(el: Element, handle: string | null): boolean {
  const revealed = el.getAttribute(REVEALED_ATTR);
  if (revealed === null) return false;
  if (revealed === handle) return true;
  el.removeAttribute(REVEALED_ATTR);
  return false;
}

function pickTreatment(article: HTMLElement, ctx: FilterContext): Treatment | null {
  const author = getTweetAuthor(article);
  const authorRevealed = isRevealed(article, author);
  const card = getQuotedCard(article);
  const quoted = card ? getQuotedAuthor(card) : null;
  const quotedRevealed = card ? isRevealed(card, quoted) : false;
  if (!ctx.enabled) return null;

  if (isBlocked(author, ctx)) {
    if (authorRevealed) return { target: article, state: 'locked', handle: author, notice: 'lock' };
    return ctx.mode === 'hide'
      ? { target: getTimelineCell(article), state: 'hidden', handle: author, notice: null }
      : { target: article, state: 'collapsed', handle: author, notice: 'post' };
  }
  // A revealed quote card needs no Engagement lock: cards have no action bar.
  if (card && isBlocked(quoted, ctx) && !quotedRevealed) {
    return { target: card, state: 'collapsed', handle: quoted, notice: 'quote' };
  }
  return null;
}

function stateKey(treatment: Treatment | null): string {
  return treatment ? `${treatment.state}:${treatment.notice ?? ''}:${treatment.handle}` : '';
}

/** True for a Notice element built by this module. */
export function isNotice(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.classList.contains(NOTICE_CLASS);
}

function isNoticeFor(el: Element | null, handle: string): boolean {
  return isNotice(el) && el.getAttribute(HANDLE_ATTR) === handle;
}

// True when the DOM still reflects `treatment`; X may re-render and drop our
// Notice without touching the attributes on its own elements.
function isApplied(treatment: Treatment | null): boolean {
  if (!treatment) return true;
  const { target, state, handle, notice } = treatment;
  if (target.getAttribute(FILTER_ATTR) !== state) return false;
  return !notice || isNoticeFor(target.previousElementSibling, handle);
}

// Keep in sync with the icon styles in entrypoints/content/style.css. Paths use
// a 24x24 grid; filled paths are the sparkle of the brand mark.
const ICONS: Record<'brand' | 'lock', { d: string; filled?: boolean }[]> = {
  brand: [
    { d: 'M4 9h16l-6.5 7v5l-3-1.5V16z' },
    { d: 'M12 1.5l.9 1.6 1.6.9-1.6.9-.9 1.6-.9-1.6-1.6-.9 1.6-.9z', filled: true },
  ],
  lock: [
    { d: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z' },
    { d: 'M8 11V8a4 4 0 0 1 8 0v3' },
  ],
};

function buildIcon(doc: Document, name: keyof typeof ICONS): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ai-reply-filter-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const { d, filled } of ICONS[name]) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    if (filled) path.setAttribute('class', 'ai-reply-filter-icon-fill');
    svg.append(path);
  }
  return svg;
}

function buildSpan(doc: Document, className: string, text: string): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function buildButton(doc: Document, text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ai-reply-filter-button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

const NOTICE_TITLES: Record<NoticeVariant, string> = {
  post: 'Hidden: listed AI reply account',
  quote: 'Hidden quote: listed AI reply account',
  lock: 'Interactions disabled',
};

function buildNotice(
  { target, handle }: Treatment,
  notice: NoticeVariant,
  article: HTMLElement,
  ctx: FilterContext,
): HTMLElement {
  const doc = target.ownerDocument;
  const isLock = notice === 'lock';
  const root = doc.createElement('div');
  root.className = isLock ? `${NOTICE_CLASS} ${NOTICE_CLASS}-lock` : NOTICE_CLASS;
  root.setAttribute(HANDLE_ATTR, handle);
  // Clicks bubble from the buttons too; stopping them here keeps X from
  // opening the post underneath.
  root.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const text = doc.createElement('span');
  text.className = 'ai-reply-filter-text';
  text.append(
    buildSpan(doc, 'ai-reply-filter-title', NOTICE_TITLES[notice]),
    buildSpan(
      doc,
      'ai-reply-filter-detail',
      isLock ? `· @${handle} is a listed AI reply account` : `@${handle}`,
    ),
  );

  const actions = doc.createElement('span');
  actions.className = 'ai-reply-filter-actions';
  if (!isLock) {
    // Reveal: mark the target and let applyFilter swap the collapse for the
    // Engagement lock (post) or nothing (quote card).
    actions.append(
      buildButton(doc, 'Show', `Show this post from @${handle}`, () => {
        target.setAttribute(REVEALED_ATTR, handle);
        applyFilter(article, ctx);
      }),
    );
  }
  actions.append(
    buildButton(doc, 'Always show', `Always show @${handle}`, () => ctx.onAlwaysShow(handle)),
  );

  root.append(buildIcon(doc, isLock ? 'lock' : 'brand'), text, actions);
  return root;
}

// Clears everything applyFilter may have set for `article`. Without a
// timeline cell the article's own Notice sits outside it, before it.
function clearArticle(article: HTMLElement): void {
  const cell = getTimelineCell(article);
  clearFilter(cell);
  if (cell === article && isNotice(article.previousElementSibling)) article.previousElementSibling.remove();
}

export function applyFilter(article: HTMLElement, ctx: FilterContext): void {
  const treatment = pickTreatment(article, ctx);
  const key = stateKey(treatment);
  // Skipping unchanged articles keeps a MutationObserver caller from looping
  // on the mutations this function itself causes.
  if (article.getAttribute(STATE_ATTR) === key && isApplied(treatment)) return;

  clearArticle(article);
  article.setAttribute(STATE_ATTR, key);
  if (!treatment) return;

  treatment.target.setAttribute(FILTER_ATTR, treatment.state);
  if (treatment.notice) {
    treatment.target.before(buildNotice(treatment, treatment.notice, article, ctx));
  }
}

// Hide without a Notice; only touches the DOM when the state changes.
function setHidden(target: HTMLElement, hidden: boolean): void {
  if (hidden) {
    if (target.getAttribute(FILTER_ATTR) !== 'hidden') target.setAttribute(FILTER_ATTR, 'hidden');
  } else if (target.hasAttribute(FILTER_ATTR)) {
    target.removeAttribute(FILTER_ATTR);
  }
}

/** Hides a user cell (follow suggestion, user list row) of a Listed account. */
export function applyUserCellFilter(cell: HTMLElement, ctx: FilterContext): void {
  setHidden(getTimelineCell(cell), ctx.enabled && isBlocked(getUserCellHandle(cell), ctx));
}

/** Hides a notification whose actors are all Listed accounts. */
export function applyNotificationFilter(notification: HTMLElement, ctx: FilterContext): void {
  const actors = getNotificationActors(notification);
  const hidden = ctx.enabled && actors.length > 0 && actors.every((actor) => isBlocked(actor, ctx));
  setHidden(getTimelineCell(notification), hidden);
}

/**
 * Hides the inline reply composer under a focal post by a Listed account,
 * whether that post is collapsed, hidden or revealed. Best effort: depends on
 * X rendering the composer in the cells right after the focal post.
 */
export function applyComposerFilter(root: Document, ctx: FilterContext): void {
  const focal = findFocalPost(root);
  const cells = focal && ctx.enabled && isBlocked(getTweetAuthor(focal), ctx) ? findComposerCells(focal) : [];
  for (const el of root.querySelectorAll<HTMLElement>(`[${STATE_ATTR}="${COMPOSER_STATE}"]`)) {
    if (cells.includes(el)) continue;
    el.removeAttribute(FILTER_ATTR);
    el.removeAttribute(STATE_ATTR);
  }
  for (const cell of cells) {
    setHidden(cell, true);
    if (cell.getAttribute(STATE_ATTR) !== COMPOSER_STATE) cell.setAttribute(STATE_ATTR, COMPOSER_STATE);
  }
}

/**
 * True when a keyboard shortcut (like, reply, repost, bookmark, share) would
 * engage with a post we collapsed or locked. Typing in editable fields and
 * modified keys are never blocked.
 */
export function shouldBlockShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>,
  activeElement: Element | null,
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  // Synthetic keydowns (e.g. Chrome autofill) can arrive without a key.
  if (typeof event.key !== 'string') return false;
  if (!BLOCKED_SHORTCUTS.has(event.key.toLowerCase())) return false;
  if (event.target instanceof Element && event.target.closest(EDITABLE_SELECTOR)) return false;
  const article = activeElement ? getOutermostTweet(activeElement) : null;
  const state = article?.getAttribute(FILTER_ATTR);
  return state === 'collapsed' || state === 'locked';
}
