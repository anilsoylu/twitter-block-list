import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('provides a DOM', () => {
    document.body.innerHTML = '<p>ready</p>';

    expect(document.querySelector('p')?.textContent).toBe('ready');
  });
});
