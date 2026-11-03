import { describe, expect, it } from 'vitest';
import { normalizeCitationStream, normalizeCitations } from './citations.js';

describe('normalizeCitations', () => {
  it('turns full-width and line-numbered citations into plain [n]', () => {
    expect(normalizeCitations('a【1】 b【3†L9-L13】.')).toBe('a[1] b[3].');
  });

  it('leaves plain citations alone', () => {
    expect(normalizeCitations('a [1][2] b')).toBe('a [1][2] b');
  });
});

async function* tokensOf(parts: string[]): AsyncGenerator<string> {
  for (const part of parts) yield part;
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const token of stream) text += token;
  return text;
}

describe('normalizeCitationStream', () => {
  it('passes ordinary text through token by token', async () => {
    const out: string[] = [];
    for await (const token of normalizeCitationStream(tokensOf(['Hello', ' world'])))
      out.push(token);
    expect(out).toEqual(['Hello', ' world']);
  });

  it('fixes a citation that is split across tokens', async () => {
    const text = await collect(
      normalizeCitationStream(tokensOf(['Power【', '1†L', '1-L4】 is key【2', '】.'])),
    );
    expect(text).toBe('Power[1] is key[2].');
  });

  it('keeps an unfinished citation instead of losing it', async () => {
    const text = await collect(normalizeCitationStream(tokensOf(['end 【1'])));
    expect(text).toBe('end 【1');
  });
});
