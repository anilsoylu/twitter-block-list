import { describe, expect, it } from 'vitest';
import { getQuotedAuthor, getQuotedCard, getTimelineCell, getTweetAuthor } from '@/utils/selectors';
import { loadFixture } from './load-fixture';

describe('getTweetAuthor', () => {
  it('reads the author of a normal post', () => {
    expect(getTweetAuthor(loadFixture('normal-post'))).toBe('alice');
  });

  it('returns the original author of a repost, not the reposter', () => {
    expect(getTweetAuthor(loadFixture('repost'))).toBe('alice');
  });

  it('returns the quoting author, not the quoted one', () => {
    expect(getTweetAuthor(loadFixture('quote-post'))).toBe('quoter');
  });

  it('lowercases mixed-case hrefs', () => {
    const article = loadFixture('normal-post');
    for (const link of article.querySelectorAll('a[href="/alice"]')) link.setAttribute('href', '/Alice');
    expect(getTweetAuthor(article)).toBe('alice');
  });

  it('ignores reserved paths such as /i/... and /home', () => {
    expect(getTweetAuthor(loadFixture('reserved-links-post'))).toBeNull();
  });

  it('ignores links inside a nested article', () => {
    expect(getTweetAuthor(loadFixture('nested-article-post'))).toBeNull();
  });
});

describe('getQuotedCard and getQuotedAuthor', () => {
  it('finds the quote card and reads the handle from its @text', () => {
    const card = getQuotedCard(loadFixture('quote-post'));
    expect(card?.getAttribute('role')).toBe('link');
    expect(getQuotedAuthor(card!)).toBe('quoted');
  });

  it('prefers a profile link inside the card when present', () => {
    const card = getQuotedCard(loadFixture('quote-post-with-links'));
    expect(getQuotedAuthor(card!)).toBe('linked_quoted');
  });

  it('returns null for posts without a quote card', () => {
    expect(getQuotedCard(loadFixture('normal-post'))).toBeNull();
  });

  it('returns null when the card has no User-Name', () => {
    document.body.innerHTML = '<div role="link"><span>@nobody</span></div>';
    expect(getQuotedAuthor(document.querySelector('div')!)).toBeNull();
  });
});

describe('getTimelineCell', () => {
  it('returns the enclosing cellInnerDiv', () => {
    const cell = getTimelineCell(loadFixture('normal-post'));
    expect(cell.getAttribute('data-testid')).toBe('cellInnerDiv');
  });

  it('falls back to the article itself when there is no cell', () => {
    const article = loadFixture('focal-post');
    expect(getTimelineCell(article)).toBe(article);
  });
});
