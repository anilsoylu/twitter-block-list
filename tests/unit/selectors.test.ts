import { describe, expect, it } from 'vitest';
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
  NOTIFICATION_SELECTOR,
  USER_CELL_SELECTOR,
} from '@/utils/selectors';
import { loadFixture, loadFixtureElement, readFixture } from './load-fixture';

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

describe('getOutermostTweet', () => {
  it('returns the outer article for a node inside a nested article', () => {
    const outer = loadFixture('nested-article-post');
    const inner = outer.querySelector('article article a')!;
    expect(getOutermostTweet(inner)).toBe(outer);
  });

  it('returns the article itself and null outside any post', () => {
    const article = loadFixture('normal-post');
    expect(getOutermostTweet(article)).toBe(article);
    expect(getOutermostTweet(document.body)).toBeNull();
  });
});

describe('getUserCellHandle', () => {
  it('reads the handle from the profile link', () => {
    expect(getUserCellHandle(loadFixtureElement('user-cell', USER_CELL_SELECTOR))).toBe('alice');
  });

  it('falls back to the @handle text when there are no links', () => {
    expect(getUserCellHandle(loadFixtureElement('sidebar-user-cell', USER_CELL_SELECTOR))).toBe('alice');
  });
});

describe('getNotificationActors', () => {
  it('returns unique actors and skips mentions inside tweetText', () => {
    const notification = loadFixtureElement('like-notification', NOTIFICATION_SELECTOR);
    expect(getNotificationActors(notification)).toEqual(['alice', 'bob']);
  });

  it('skips links inside a nested post', () => {
    const notification = loadFixtureElement('like-notification', NOTIFICATION_SELECTOR);
    notification.insertAdjacentHTML(
      'beforeend',
      '<article data-testid="tweet"><div data-testid="User-Name"><a href="/dave">Dave</a></div></article>',
    );
    expect(getNotificationActors(notification)).toEqual(['alice', 'bob']);
  });

  it('returns an empty list without profile links', () => {
    document.body.innerHTML = '<article data-testid="notification"><a href="/i/notifications">x</a></article>';
    expect(getNotificationActors(document.querySelector('article')!)).toEqual([]);
  });
});

describe('findFocalPost and findComposerCells', () => {
  it('finds the tabindex=-1 post and the composer cell right after it', () => {
    document.body.innerHTML = readFixture('focal-post-with-composer');
    const focal = findFocalPost(document);
    expect(getTweetAuthor(focal!)).toBe('alice');
    const cells = findComposerCells(focal!);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.querySelector('[data-testid="tweetButtonInline"]')).not.toBeNull();
  });

  it('returns null without a focal post', () => {
    loadFixture('normal-post');
    expect(findFocalPost(document)).toBeNull();
  });

  it('returns no cells when the focal post has no cell', () => {
    expect(findComposerCells(loadFixture('focal-post'))).toEqual([]);
  });
});
