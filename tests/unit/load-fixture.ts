import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES_DIR = resolve(__dirname, '../fixtures');

export function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, `${name}.html`), 'utf8');
}

/** Replaces the document body with a fixture and returns its first top-level post article. */
export function loadFixture(name: string): HTMLElement {
  document.body.innerHTML = readFixture(name);
  const article = document.querySelector<HTMLElement>('article[data-testid="tweet"]');
  if (!article) throw new Error(`Fixture ${name} has no post article`);
  return article;
}
