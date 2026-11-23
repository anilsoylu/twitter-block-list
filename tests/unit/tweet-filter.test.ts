import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyComposerFilter,
  applyFilter,
  applyNotificationFilter,
  applyUserCellFilter,
  clearFilter,
  isBlocked,
  isNotice,
  shouldBlockShortcut,
  type FilterContext,
} from '@/utils/tweet-filter';
import { loadFixture, loadFixtureElement, readFixture } from './load-fixture';

const NOTICE = '.ai-reply-filter-notice';
const LOCK_NOTICE = 'ai-reply-filter-notice-lock';
const FILTER_ATTR = 'data-ai-reply-filter';
const REVEALED_ATTR = 'data-ai-reply-filter-revealed';
const STYLE_CSS = readFileSync(resolve(__dirname, '../../entrypoints/content/style.css'), 'utf8');

function makeContext(overrides: Partial<Omit<FilterContext, 'blocklist' | 'allowlist'>> & {
  blocklist?: string[];
  allowlist?: string[];
} = {}): FilterContext {
  const { blocklist = ['alice'], allowlist = [], ...rest } = overrides;
  return {
    enabled: true,
    mode: 'collapse',
    onAlwaysShow: vi.fn(),
    ...rest,
    blocklist: new Set(blocklist),
    allowlist: new Set(allowlist),
  };
}

function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!button) throw new Error(`No button "${text}"`);
  return button;
}

/**
 * Dispatches a click marked as trusted, standing in for a real user click.
 * happy-dom's click() is untrusted, like a page script calling click().
 */
function userClick(el: HTMLElement): void {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'isTrusted', { value: true });
  el.dispatchEvent(event);
}

function cellOf(el: HTMLElement): HTMLElement {
  return el.closest<HTMLElement>('[data-testid="cellInnerDiv"]')!;
}

function noticeOf(target: Element): HTMLElement {
  const notice = target.previousElementSibling;
  if (!isNotice(notice)) throw new Error('Target has no Notice before it');
  return notice;
}

function noticeTexts(notice: Element): { title: string; detail: string; buttons: string[]; labels: string[] } {
  const buttons = Array.from(notice.querySelectorAll('button'));
  return {
    title: notice.querySelector('.ai-reply-filter-title')!.textContent!,
    detail: notice.querySelector('.ai-reply-filter-detail')!.textContent!,
    buttons: buttons.map((b) => b.textContent!),
    labels: buttons.map((b) => b.getAttribute('aria-label')!),
  };
}

function switchAuthor(article: HTMLElement, from: string, to: string): void {
  for (const link of article.querySelectorAll(`a[href="/${from}"]`)) link.setAttribute('href', `/${to}`);
}

describe('isBlocked', () => {
  const ctx = { blocklist: new Set(['alice', 'bob']), allowlist: new Set(['bob']) };

  it('is true for a listed handle', () => expect(isBlocked('alice', ctx)).toBe(true));
  it('is false for an allowlisted handle', () => expect(isBlocked('bob', ctx)).toBe(false));
  it('is false for an unlisted handle', () => expect(isBlocked('carol', ctx)).toBe(false));
  it('is false for null', () => expect(isBlocked(null, ctx)).toBe(false));
});

describe('applyFilter in collapse mode', () => {
  it('marks the article collapsed and puts exactly one Notice right before it', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());

    expect(article.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(document.querySelectorAll(NOTICE)).toHaveLength(1);
    expect(article.querySelector(NOTICE)).toBeNull();
    expect(noticeTexts(noticeOf(article))).toEqual({
      title: 'Hidden: listed AI reply account',
      detail: '@alice',
      buttons: ['Show', 'Always show'],
      labels: ['Show this post from @alice', 'Always show @alice'],
    });
  });

  it('keeps the collapse when X overwrites the article className', () => {
    const article = loadFixture('normal-post');
    const style = document.createElement('style');
    style.textContent = STYLE_CSS;
    document.head.append(style);
    expect(getComputedStyle(article).display).not.toBe('none');
    applyFilter(article, makeContext());

    article.className = 'css-175oi2r r-x';

    expect(article.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(getComputedStyle(article).display).toBe('none');
    style.remove();
  });

  it('inserts the Notice before the article inside a flex-row parent', () => {
    const article = loadFixture('discover-more-post');
    applyFilter(article, makeContext());

    expect(article.parentElement!.getAttribute('style')).toContain('flex-direction: row');
    expect(article.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(noticeOf(article).parentElement).toBe(article.parentElement);
    expect(document.querySelectorAll(NOTICE)).toHaveLength(1);
  });

  it('leaves posts by unlisted or allowlisted authors untouched', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext({ allowlist: ['alice'] }));

    expect(document.querySelector(NOTICE)).toBeNull();
    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);
  });

  it('re-inserts the Notice when X re-renders and drops it', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);
    noticeOf(article).remove();

    applyFilter(article, ctx);

    expect(noticeOf(article)).toBeTruthy();
    expect(document.querySelectorAll(NOTICE)).toHaveLength(1);
  });

  it('Show reveals the post under an Engagement lock that survives later passes', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);

    userClick(buttonByText(noticeOf(article), 'Show'));

    expect(article.getAttribute(REVEALED_ATTR)).toBe('alice');
    expect(article.getAttribute(FILTER_ATTR)).toBe('locked');
    const lock = noticeOf(article);
    expect(lock.classList.contains(LOCK_NOTICE)).toBe(true);
    expect(noticeTexts(lock)).toEqual({
      title: 'Interactions disabled',
      detail: '· @alice is a listed AI reply account',
      buttons: ['Always show'],
      labels: ['Always show @alice'],
    });

    applyFilter(article, ctx);
    applyFilter(article, makeContext());

    expect(article.getAttribute(FILTER_ATTR)).toBe('locked');
    expect(document.querySelectorAll(NOTICE)).toHaveLength(1);
  });

  it('Always show calls onAlwaysShow with the handle, from both Notice variants', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);

    userClick(buttonByText(noticeOf(article), 'Always show'));
    userClick(buttonByText(noticeOf(article), 'Show'));
    userClick(buttonByText(noticeOf(article), 'Always show'));

    expect(ctx.onAlwaysShow).toHaveBeenCalledTimes(2);
    expect(ctx.onAlwaysShow).toHaveBeenCalledWith('alice');
  });

  it('ignores untrusted clicks on Show and Always show', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);

    buttonByText(noticeOf(article), 'Show').click();
    buttonByText(noticeOf(article), 'Always show').click();

    expect(article.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(article.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(ctx.onAlwaysShow).not.toHaveBeenCalled();
  });

  it('does not let clicks on the Notice bubble to the cell', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());
    const cellClick = vi.fn();
    cellOf(article).addEventListener('click', cellClick);

    noticeOf(article).querySelector<HTMLElement>('.ai-reply-filter-text')!.click();
    userClick(buttonByText(noticeOf(article), 'Always show'));
    userClick(buttonByText(noticeOf(article), 'Show'));
    userClick(buttonByText(noticeOf(article), 'Always show'));

    expect(cellClick).not.toHaveBeenCalled();
  });

  it('collapses only the quote card, with its Notice before the card', () => {
    const article = loadFixture('quote-post');
    applyFilter(article, makeContext({ blocklist: ['quoted'] }));

    const card = article.querySelector<HTMLElement>('div[role="link"]')!;
    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);
    expect(card.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(noticeTexts(noticeOf(card)).title).toBe('Hidden quote: listed AI reply account');
    expect(document.querySelectorAll(NOTICE)).toHaveLength(1);
  });

  it('Show on a quote card reveals it without a lock', () => {
    const article = loadFixture('quote-post');
    const ctx = makeContext({ blocklist: ['quoted'] });
    applyFilter(article, ctx);
    const card = article.querySelector<HTMLElement>('div[role="link"]')!;

    userClick(buttonByText(noticeOf(card), 'Show'));
    applyFilter(article, ctx);

    expect(card.getAttribute(REVEALED_ATTR)).toBe('quoted');
    expect(document.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
    expect(document.querySelector(NOTICE)).toBeNull();
  });

  it('collapses the whole post, not the card, when both authors are listed', () => {
    const article = loadFixture('quote-post');
    applyFilter(article, makeContext({ blocklist: ['quoter', 'quoted'] }));

    expect(article.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(article.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
    expect(document.querySelectorAll(NOTICE)).toHaveLength(1);
  });

  it('locks only the post itself, never its quote card', () => {
    const article = loadFixture('post-with-action-bar');
    applyFilter(article, makeContext({ blocklist: ['alice', 'quoted'] }));
    userClick(buttonByText(noticeOf(article), 'Show'));

    expect(article.getAttribute(FILTER_ATTR)).toBe('locked');
    expect(article.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
  });
});

describe('applyFilter in hide mode', () => {
  it('marks the timeline cell hidden without a Notice', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));

    expect(cellOf(article).getAttribute(FILTER_ATTR)).toBe('hidden');
    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);
    expect(document.querySelector(NOTICE)).toBeNull();
  });

  it('falls back to the article when there is no cell', () => {
    const article = loadFixture('focal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));

    expect(article.getAttribute(FILTER_ATTR)).toBe('hidden');
  });

  it('switching from collapse to hide removes the Notice', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());
    applyFilter(article, makeContext({ mode: 'hide' }));

    expect(document.querySelector(NOTICE)).toBeNull();
    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);
    expect(cellOf(article).getAttribute(FILTER_ATTR)).toBe('hidden');
  });

  it('removes a cell-less article Notice when switching to hide', () => {
    const article = loadFixture('focal-post');
    applyFilter(article, makeContext());
    applyFilter(article, makeContext({ mode: 'hide' }));

    expect(document.querySelector(NOTICE)).toBeNull();
    expect(article.getAttribute(FILTER_ATTR)).toBe('hidden');
  });
});

describe('applyFilter when disabled', () => {
  it('clears an existing collapse', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());
    applyFilter(article, makeContext({ enabled: false }));

    expect(document.querySelector(NOTICE)).toBeNull();
    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);
  });

  it('clears an existing hide', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));
    applyFilter(article, makeContext({ enabled: false, mode: 'hide' }));

    expect(cellOf(article).hasAttribute(FILTER_ATTR)).toBe(false);
  });
});

describe('applyFilter on a recycled article', () => {
  it('drops the old collapse when the author changes to an unlisted one', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(document.querySelector(NOTICE)).toBeNull();
    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);
  });

  it('collapses a previously unlisted post when the author changes to a listed one', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ blocklist: ['bob'] });
    applyFilter(article, ctx);
    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(article.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(noticeTexts(noticeOf(article)).detail).toBe('@bob');
  });

  it('updates the Notice when the author changes to another listed one', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ blocklist: ['alice', 'bob'] });
    applyFilter(article, ctx);

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(document.querySelectorAll(NOTICE)).toHaveLength(1);
    expect(noticeTexts(noticeOf(article)).detail).toBe('@bob');
  });

  it('drops the revealed marker so a new listed author is collapsed again', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ blocklist: ['alice', 'bob'] });
    applyFilter(article, ctx);
    userClick(buttonByText(noticeOf(article), 'Show'));

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(article.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(article.getAttribute(FILTER_ATTR)).toBe('collapsed');
    expect(noticeTexts(noticeOf(article)).detail).toBe('@bob');
  });

  it('moves a hide treatment off the cell when the author changes', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ mode: 'hide' });
    applyFilter(article, ctx);

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(cellOf(article).hasAttribute(FILTER_ATTR)).toBe(false);
  });
});

describe('clearFilter', () => {
  it('removes Notices and filter attributes but keeps the revealed marker', () => {
    const quote = loadFixture('quote-post');
    applyFilter(quote, makeContext({ blocklist: ['quoted'] }));
    const card = quote.querySelector('div[role="link"]')!;
    userClick(buttonByText(noticeOf(card), 'Show'));
    expect(card.getAttribute(REVEALED_ATTR)).toBe('quoted');

    const normal = document.createElement('div');
    normal.innerHTML = readFixture('normal-post');
    document.body.append(normal);
    applyFilter(normal.querySelector<HTMLElement>('article')!, makeContext());

    clearFilter(document.body);

    expect(document.querySelector(NOTICE)).toBeNull();
    expect(document.querySelector(`[${FILTER_ATTR}], [data-ai-reply-filter-state]`)).toBeNull();
    expect(card.getAttribute(REVEALED_ATTR)).toBe('quoted');
  });

  it('clears the root element itself', () => {
    const article = loadFixture('focal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));

    clearFilter(article);

    expect(article.hasAttribute(FILTER_ATTR)).toBe(false);
    expect(article.hasAttribute('data-ai-reply-filter-state')).toBe(false);
  });
});

describe('mutation loop guard', () => {
  it.each([
    ['a collapsed post', 'collapse'],
    ['a hidden post', 'hide'],
  ] as const)('makes no DOM changes when re-run on %s', async (_label, mode) => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ mode });
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    applyFilter(article, ctx);
    expect(observer.takeRecords().length).toBeGreaterThan(0);

    applyFilter(article, ctx);
    applyFilter(article, ctx);
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('makes no DOM changes on a locked post on repeated passes', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);
    userClick(buttonByText(noticeOf(article), 'Show'));
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    applyFilter(article, ctx);

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  it('makes no DOM changes for an untouched post on repeated passes', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ blocklist: ['bob'] });
    applyFilter(article, ctx);
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    applyFilter(article, ctx);

    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});

describe('shouldBlockShortcut', () => {
  function key(key: string, target: Element = document.body, mods: Partial<KeyboardEvent> = {}) {
    return { key, ctrlKey: false, metaKey: false, altKey: false, target, ...mods };
  }

  function setUp(state: 'collapsed' | 'locked' | 'unlisted'): HTMLElement {
    const article = loadFixture('post-with-action-bar');
    applyFilter(article, makeContext({ blocklist: state === 'unlisted' ? [] : ['alice'] }));
    if (state === 'locked') userClick(buttonByText(noticeOf(article), 'Show'));
    return article.querySelector<HTMLElement>('[data-testid="like"]')!;
  }

  it.each(['collapsed', 'locked'] as const)('blocks l/r/t/b/s inside a %s post', (state) => {
    const inner = setUp(state);
    for (const k of ['l', 'r', 't', 'b', 's', 'L', 'R', 'T', 'B', 'S']) {
      expect(shouldBlockShortcut(key(k, inner), inner), k).toBe(true);
    }
  });

  it('blocks when the article itself is focused', () => {
    const article = setUp('locked').closest('article')!;
    expect(shouldBlockShortcut(key('l', article), article)).toBe(true);
  });

  it('allows modified keys', () => {
    const inner = setUp('locked');
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(shouldBlockShortcut(key('l', inner, { [mod]: true }), inner), mod).toBe(false);
    }
  });

  it('allows other keys', () => {
    const inner = setUp('locked');
    for (const k of ['j', 'k', 'Enter', ' ', 'n']) expect(shouldBlockShortcut(key(k, inner), inner), k).toBe(false);
  });

  it('allows typing in an editable target', () => {
    const inner = setUp('locked');
    document.body.insertAdjacentHTML('beforeend', '<input id="i" /><div id="ce" contenteditable="true"><span></span></div>');
    expect(shouldBlockShortcut(key('l', document.getElementById('i')!), inner)).toBe(false);
    expect(shouldBlockShortcut(key('l', document.querySelector('#ce span')!), inner)).toBe(false);
  });

  it('allows shortcuts on unlisted posts and outside posts', () => {
    const inner = setUp('unlisted');
    expect(shouldBlockShortcut(key('l', inner), inner)).toBe(false);
    expect(shouldBlockShortcut(key('l'), document.body)).toBe(false);
    expect(shouldBlockShortcut(key('l'), null)).toBe(false);
  });

  it('ignores synthetic keydowns without a key', () => {
    const inner = setUp('locked');
    const event = { ...key('l', inner), key: undefined as unknown as string };
    expect(shouldBlockShortcut(event, inner)).toBe(false);
  });
});

describe('applyUserCellFilter', () => {
  it('hides the timeline cell of a listed account', () => {
    const userCell = loadFixtureElement('user-cell', '[data-testid="UserCell"]');
    applyUserCellFilter(userCell, makeContext());

    expect(cellOf(userCell).getAttribute(FILTER_ATTR)).toBe('hidden');
    expect(userCell.hasAttribute(FILTER_ATTR)).toBe(false);
  });

  it.each([
    ['allowlisted', makeContext({ allowlist: ['alice'] })],
    ['unlisted', makeContext({ blocklist: ['bob'] })],
    ['disabled', makeContext({ enabled: false })],
  ])('leaves an %s account visible and clears an earlier hide', (_label, ctx) => {
    const userCell = loadFixtureElement('user-cell', '[data-testid="UserCell"]');
    applyUserCellFilter(userCell, makeContext());

    applyUserCellFilter(userCell, ctx);

    expect(document.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
  });

  it('hides the UserCell itself in the sidebar, where there is no timeline cell', () => {
    const userCell = loadFixtureElement('sidebar-user-cell', '[data-testid="UserCell"]');
    applyUserCellFilter(userCell, makeContext());

    expect(userCell.getAttribute(FILTER_ATTR)).toBe('hidden');
  });
});

describe('applyNotificationFilter', () => {
  function load(): HTMLElement {
    return loadFixtureElement('like-notification', '[data-testid="notification"]');
  }

  it('hides a notification whose actors are all listed', () => {
    const notification = load();
    applyNotificationFilter(notification, makeContext({ blocklist: ['alice', 'bob'] }));

    expect(cellOf(notification).getAttribute(FILTER_ATTR)).toBe('hidden');
  });

  it('keeps it visible when one actor is not listed', () => {
    const notification = load();
    applyNotificationFilter(notification, makeContext({ blocklist: ['alice'] }));

    expect(document.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
  });

  it('ignores mentions in the post text and links inside a nested post', () => {
    const notification = load();
    notification.insertAdjacentHTML(
      'beforeend',
      '<article data-testid="tweet"><div data-testid="User-Name"><a href="/dave">Dave</a></div></article>',
    );
    applyNotificationFilter(notification, makeContext({ blocklist: ['alice', 'bob'] }));

    expect(cellOf(notification).getAttribute(FILTER_ATTR)).toBe('hidden');
  });

  it('keeps a notification without actors visible', () => {
    document.body.innerHTML =
      '<div data-testid="cellInnerDiv"><article data-testid="notification"><span>New login</span></article></div>';
    const notification = document.querySelector<HTMLElement>('article')!;
    applyNotificationFilter(notification, makeContext());

    expect(document.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
  });

  it('un-hides when disabled', () => {
    const notification = load();
    applyNotificationFilter(notification, makeContext({ blocklist: ['alice', 'bob'] }));
    applyNotificationFilter(notification, makeContext({ blocklist: ['alice', 'bob'], enabled: false }));

    expect(document.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
  });
});

describe('applyComposerFilter', () => {
  function load(): { focal: HTMLElement; composer: HTMLElement } {
    document.body.innerHTML = readFixture('focal-post-with-composer');
    const focal = document.querySelector<HTMLElement>('article[tabindex="-1"]')!;
    const composer = cellOf(document.querySelector<HTMLElement>('[data-testid="tweetButtonInline"]')!);
    return { focal, composer };
  }

  it('hides the composer under a collapsed listed focal post', () => {
    const { focal, composer } = load();
    const ctx = makeContext();
    applyFilter(focal, ctx);
    applyComposerFilter(document, ctx);

    expect(composer.getAttribute(FILTER_ATTR)).toBe('hidden');
    expect(document.querySelectorAll(`[${FILTER_ATTR}="hidden"]`)).toHaveLength(1);
  });

  it('keeps the composer hidden after the focal post is revealed', () => {
    const { focal, composer } = load();
    const ctx = makeContext();
    applyFilter(focal, ctx);
    userClick(buttonByText(noticeOf(focal), 'Show'));
    applyComposerFilter(document, ctx);

    expect(focal.getAttribute(FILTER_ATTR)).toBe('locked');
    expect(composer.getAttribute(FILTER_ATTR)).toBe('hidden');
  });

  it.each([
    ['the focal author is unlisted', makeContext({ blocklist: ['bob'] })],
    ['the filter is disabled', makeContext({ enabled: false })],
  ])('clears the composer when %s', (_label, ctx) => {
    const { composer } = load();
    applyComposerFilter(document, makeContext());

    applyComposerFilter(document, ctx);

    expect(composer.hasAttribute(FILTER_ATTR)).toBe(false);
    expect(composer.hasAttribute('data-ai-reply-filter-state')).toBe(false);
  });

  it('is a no-op without a focal post', () => {
    loadFixture('normal-post');
    applyComposerFilter(document, makeContext());

    expect(document.querySelector(`[${FILTER_ATTR}]`)).toBeNull();
  });
});
