import type { FilterMode } from './storage';
import { getQuotedAuthor, getQuotedCard, getTimelineCell, getTweetAuthor } from './selectors';

export interface FilterContext {
  enabled: boolean;
  mode: FilterMode;
  blocklist: ReadonlySet<string>;
  allowlist: ReadonlySet<string>;
  onAlwaysShow: (handle: string) => void;
}

const HIDDEN_CLASS = 'ai-reply-filter-hidden';
const COLLAPSED_CLASS = 'ai-reply-filter-collapsed';
const PLACEHOLDER_CLASS = 'ai-reply-filter-placeholder';
const STATE_ATTR = 'data-ai-reply-filter-state';
const REVEALED_ATTR = 'data-ai-reply-filter-revealed';
const HANDLE_ATTR = 'data-ai-reply-filter-handle';

interface Treatment {
  target: HTMLElement;
  className: typeof HIDDEN_CLASS | typeof COLLAPSED_CLASS;
  handle: string;
  label: string;
}

export function isBlocked(
  handle: string | null,
  ctx: Pick<FilterContext, 'blocklist' | 'allowlist'>,
): handle is string {
  return handle !== null && ctx.blocklist.has(handle) && !ctx.allowlist.has(handle);
}

// Removes our classes, placeholders and state from `root` and its descendants.
// The per-element "revealed" marker is kept on purpose so a re-scan after a
// settings or list change does not collapse posts the user chose to show.
export function clearFilter(root: ParentNode): void {
  for (const el of root.querySelectorAll(`.${PLACEHOLDER_CLASS}`)) el.remove();
  const marked = Array.from(
    root.querySelectorAll(`.${HIDDEN_CLASS}, .${COLLAPSED_CLASS}, [${STATE_ATTR}]`),
  );
  if (root instanceof Element) marked.push(root);
  for (const el of marked) {
    el.classList.remove(HIDDEN_CLASS, COLLAPSED_CLASS);
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

  if (isBlocked(author, ctx) && !authorRevealed) {
    return ctx.mode === 'hide'
      ? { target: getTimelineCell(article), className: HIDDEN_CLASS, handle: author, label: '' }
      : {
          target: article,
          className: COLLAPSED_CLASS,
          handle: author,
          label: `Post from @${author} hidden (AI reply list)`,
        };
  }
  if (card && isBlocked(quoted, ctx) && !quotedRevealed) {
    return {
      target: card,
      className: COLLAPSED_CLASS,
      handle: quoted,
      label: `Quoted post from @${quoted} hidden (AI reply list)`,
    };
  }
  return null;
}

function stateKey(treatment: Treatment | null): string {
  return treatment ? `${treatment.className}:${treatment.handle}` : '';
}

// True when the DOM still reflects `treatment`; X may re-render children and
// drop our placeholder without touching the article's attributes.
function isApplied(treatment: Treatment | null): boolean {
  if (!treatment) return true;
  const { target, className, handle } = treatment;
  if (!target.classList.contains(className)) return false;
  if (className === HIDDEN_CLASS) return true;
  const first = target.firstElementChild;
  return !!first?.classList.contains(PLACEHOLDER_CLASS) && first.getAttribute(HANDLE_ATTR) === handle;
}

function buildButton(doc: Document, text: string, onClick: () => void): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function buildPlaceholder(
  { target, handle, label }: Treatment,
  onAlwaysShow: (handle: string) => void,
): HTMLElement {
  const doc = target.ownerDocument;
  const placeholder = doc.createElement('div');
  placeholder.className = PLACEHOLDER_CLASS;
  placeholder.setAttribute(HANDLE_ATTR, handle);
  // Clicks bubble from the buttons too; stopping them here keeps X from
  // opening the post underneath.
  placeholder.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const text = doc.createElement('span');
  text.textContent = label;

  const show = buildButton(doc, 'Show', () => {
    target.classList.remove(COLLAPSED_CLASS);
    target.setAttribute(REVEALED_ATTR, handle);
    placeholder.remove();
  });
  const alwaysShow = buildButton(doc, `Always show @${handle}`, () => onAlwaysShow(handle));

  placeholder.append(text, show, alwaysShow);
  return placeholder;
}

export function applyFilter(article: HTMLElement, ctx: FilterContext): void {
  const treatment = pickTreatment(article, ctx);
  const key = stateKey(treatment);
  // Skipping unchanged articles keeps a MutationObserver caller from looping
  // on the mutations this function itself causes.
  if (article.getAttribute(STATE_ATTR) === key && isApplied(treatment)) return;

  clearFilter(getTimelineCell(article));
  article.setAttribute(STATE_ATTR, key);
  if (!treatment) return;

  treatment.target.classList.add(treatment.className);
  if (treatment.className === COLLAPSED_CLASS) {
    treatment.target.prepend(buildPlaceholder(treatment, ctx.onAlwaysShow));
  }
}
