import { describe, expect, it, vi } from 'vitest';
import { applyFilter, clearFilter, isBlocked, type FilterContext } from '@/utils/tweet-filter';
import { loadFixture, readFixture } from './load-fixture';

const PLACEHOLDER = '.ai-reply-filter-placeholder';
const COLLAPSED = 'ai-reply-filter-collapsed';
const HIDDEN = 'ai-reply-filter-hidden';
const REVEALED_ATTR = 'data-ai-reply-filter-revealed';

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

function cellOf(article: HTMLElement): HTMLElement {
  return article.closest<HTMLElement>('[data-testid="cellInnerDiv"]')!;
}

describe('isBlocked', () => {
  const ctx = { blocklist: new Set(['alice', 'bob']), allowlist: new Set(['bob']) };

  it('is true for a listed handle', () => expect(isBlocked('alice', ctx)).toBe(true));
  it('is false for an allowlisted handle', () => expect(isBlocked('bob', ctx)).toBe(false));
  it('is false for an unlisted handle', () => expect(isBlocked('carol', ctx)).toBe(false));
  it('is false for null', () => expect(isBlocked(null, ctx)).toBe(false));
});

describe('applyFilter in collapse mode', () => {
  it('inserts exactly one placeholder as the first child with the expected text', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());

    expect(article.classList.contains(COLLAPSED)).toBe(true);
    expect(article.querySelectorAll(PLACEHOLDER)).toHaveLength(1);
    const placeholder = article.firstElementChild!;
    expect(placeholder.matches(PLACEHOLDER)).toBe(true);
    expect(placeholder.querySelector('span')?.textContent).toBe('Post from @alice hidden (AI reply list)');
    expect(Array.from(placeholder.querySelectorAll('button'), (b) => b.textContent)).toEqual([
      'Show',
      'Always show @alice',
    ]);
  });

  it('stays idempotent across repeated calls', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);
    const html = document.body.innerHTML;

    applyFilter(article, ctx);
    applyFilter(article, ctx);

    expect(article.querySelectorAll(PLACEHOLDER)).toHaveLength(1);
    expect(document.body.innerHTML).toBe(html);
  });

  it('leaves posts by unlisted or allowlisted authors untouched', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext({ allowlist: ['alice'] }));

    expect(article.querySelector(PLACEHOLDER)).toBeNull();
    expect(article.classList.contains(COLLAPSED)).toBe(false);
  });

  it('re-inserts the placeholder when X re-renders children and drops it', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);
    article.querySelector(PLACEHOLDER)!.remove();

    applyFilter(article, ctx);

    expect(article.firstElementChild?.matches(PLACEHOLDER)).toBe(true);
    expect(article.querySelectorAll(PLACEHOLDER)).toHaveLength(1);
  });

  it('Show reveals the post and it stays revealed on later passes', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);

    buttonByText(article, 'Show').click();

    expect(article.querySelector(PLACEHOLDER)).toBeNull();
    expect(article.classList.contains(COLLAPSED)).toBe(false);
    expect(article.getAttribute(REVEALED_ATTR)).toBe('alice');

    applyFilter(article, ctx);
    applyFilter(article, makeContext());

    expect(article.querySelector(PLACEHOLDER)).toBeNull();
    expect(article.classList.contains(COLLAPSED)).toBe(false);
  });

  it('Always show calls onAlwaysShow with the handle', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);

    buttonByText(article, 'Always show @alice').click();

    expect(ctx.onAlwaysShow).toHaveBeenCalledExactlyOnceWith('alice');
  });

  it('does not let clicks on the placeholder bubble to the article', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());
    const articleClick = vi.fn();
    article.addEventListener('click', articleClick);

    article.querySelector<HTMLElement>(`${PLACEHOLDER} > span`)!.click();
    buttonByText(article, 'Always show @alice').click();
    buttonByText(article, 'Show').click();

    expect(articleClick).not.toHaveBeenCalled();
  });

  it('collapses only the quote card when only the quoted author is listed', () => {
    const article = loadFixture('quote-post');
    applyFilter(article, makeContext({ blocklist: ['quoted'] }));

    const card = article.querySelector<HTMLElement>('div[role="link"]')!;
    expect(article.classList.contains(COLLAPSED)).toBe(false);
    expect(card.classList.contains(COLLAPSED)).toBe(true);
    expect(card.firstElementChild?.matches(PLACEHOLDER)).toBe(true);
    expect(card.querySelector(`${PLACEHOLDER} > span`)?.textContent).toBe(
      'Quoted post from @quoted hidden (AI reply list)',
    );
    expect(article.querySelectorAll(PLACEHOLDER)).toHaveLength(1);
  });

  it('collapses the whole post, not the card, when both authors are listed', () => {
    const article = loadFixture('quote-post');
    applyFilter(article, makeContext({ blocklist: ['quoter', 'quoted'] }));

    expect(article.firstElementChild?.matches(PLACEHOLDER)).toBe(true);
    expect(article.querySelectorAll(PLACEHOLDER)).toHaveLength(1);
  });
});

describe('applyFilter in hide mode', () => {
  it('adds the hidden class to the timeline cell', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));

    expect(cellOf(article).classList.contains(HIDDEN)).toBe(true);
    expect(article.classList.contains(HIDDEN)).toBe(false);
    expect(document.querySelector(PLACEHOLDER)).toBeNull();
  });

  it('falls back to the article when there is no cell', () => {
    const article = loadFixture('focal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));

    expect(article.classList.contains(HIDDEN)).toBe(true);
  });

  it('switching from collapse to hide removes the placeholder', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());
    applyFilter(article, makeContext({ mode: 'hide' }));

    expect(document.querySelector(PLACEHOLDER)).toBeNull();
    expect(article.classList.contains(COLLAPSED)).toBe(false);
    expect(cellOf(article).classList.contains(HIDDEN)).toBe(true);
  });
});

describe('applyFilter when disabled', () => {
  it('clears an existing collapse', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext());
    applyFilter(article, makeContext({ enabled: false }));

    expect(document.querySelector(PLACEHOLDER)).toBeNull();
    expect(article.classList.contains(COLLAPSED)).toBe(false);
  });

  it('clears an existing hide', () => {
    const article = loadFixture('normal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));
    applyFilter(article, makeContext({ enabled: false, mode: 'hide' }));

    expect(cellOf(article).classList.contains(HIDDEN)).toBe(false);
  });
});

describe('applyFilter on a recycled article', () => {
  function switchAuthor(article: HTMLElement, from: string, to: string): void {
    for (const link of article.querySelectorAll(`a[href="/${from}"]`)) link.setAttribute('href', `/${to}`);
  }

  it('drops the old collapse when the author changes to an unlisted one', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    applyFilter(article, ctx);

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(article.querySelector(PLACEHOLDER)).toBeNull();
    expect(article.classList.contains(COLLAPSED)).toBe(false);
  });

  it('updates the placeholder when the author changes to another listed one', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ blocklist: ['alice', 'bob'] });
    applyFilter(article, ctx);

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(article.querySelectorAll(PLACEHOLDER)).toHaveLength(1);
    expect(article.querySelector(`${PLACEHOLDER} > span`)?.textContent).toBe(
      'Post from @bob hidden (AI reply list)',
    );
  });

  it('drops the revealed marker so a new listed author is collapsed again', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ blocklist: ['alice', 'bob'] });
    applyFilter(article, ctx);
    buttonByText(article, 'Show').click();

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(article.hasAttribute(REVEALED_ATTR)).toBe(false);
    expect(article.classList.contains(COLLAPSED)).toBe(true);
    expect(article.querySelector(`${PLACEHOLDER} > span`)?.textContent).toContain('@bob');
  });

  it('moves a hide treatment off the cell when the author changes', () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext({ mode: 'hide' });
    applyFilter(article, ctx);

    switchAuthor(article, 'alice', 'bob');
    applyFilter(article, ctx);

    expect(cellOf(article).classList.contains(HIDDEN)).toBe(false);
  });
});

describe('clearFilter', () => {
  it('removes placeholders, classes and state but keeps the revealed marker', () => {
    const quote = loadFixture('quote-post');
    applyFilter(quote, makeContext({ blocklist: ['quoted'] }));
    buttonByText(quote, 'Show').click();
    const card = quote.querySelector('div[role="link"]')!;
    expect(card.getAttribute(REVEALED_ATTR)).toBe('quoted');

    const normal = document.createElement('div');
    normal.innerHTML = readFixture('normal-post');
    document.body.append(normal);
    const article = normal.querySelector<HTMLElement>('article')!;
    applyFilter(article, makeContext());

    clearFilter(document.body);

    expect(document.querySelector(PLACEHOLDER)).toBeNull();
    expect(document.querySelector(`.${COLLAPSED}, .${HIDDEN}, [data-ai-reply-filter-state]`)).toBeNull();
    expect(card.getAttribute(REVEALED_ATTR)).toBe('quoted');
  });

  it('clears the root element itself', () => {
    const article = loadFixture('focal-post');
    applyFilter(article, makeContext({ mode: 'hide' }));

    clearFilter(article);

    expect(article.classList.contains(HIDDEN)).toBe(false);
    expect(article.hasAttribute('data-ai-reply-filter-state')).toBe(false);
  });
});

describe('mutation loop guard', () => {
  it('makes no DOM changes when re-run after its own insertion', async () => {
    const article = loadFixture('normal-post');
    const ctx = makeContext();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    applyFilter(article, ctx);
    await Promise.resolve();
    records.push(...observer.takeRecords());
    expect(records.length).toBeGreaterThan(0);

    records.length = 0;
    applyFilter(article, ctx);
    applyFilter(article, ctx);
    records.push(...observer.takeRecords());
    observer.disconnect();

    expect(records).toHaveLength(0);
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
