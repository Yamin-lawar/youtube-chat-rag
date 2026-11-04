import { describe, expect, it } from 'vitest';
import { citationNumber, linkCitations } from './citations';

describe('linkCitations', () => {
  it('turns [n] into a citation link', () => {
    expect(linkCitations('Power is huge [1].')).toBe('Power is huge [1](#cite-1).');
  });

  it('handles neighbouring citations', () => {
    expect(linkCitations('Both agree [1][2]')).toBe('Both agree [1](#cite-1)[2](#cite-2)');
  });

  it('leaves real links alone', () => {
    expect(linkCitations('See [1](https://example.com)')).toBe('See [1](https://example.com)');
  });
});

describe('citationNumber', () => {
  it('reads the number from a citation link', () => expect(citationNumber('#cite-3')).toBe(3));
  it('returns null for other links', () => expect(citationNumber('https://a.com')).toBeNull());
});
