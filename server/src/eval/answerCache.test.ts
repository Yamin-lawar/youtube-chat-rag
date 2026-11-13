import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnswerCache, answerKey } from './answerCache.js';

describe('answerKey', () => {
  it('is the same for the same prompt and provider', () => {
    expect(answerKey('groq', 'system', 'user')).toBe(answerKey('groq', 'system', 'user'));
  });

  it('changes when the provider, the system prompt or the user prompt changes', () => {
    const base = answerKey('groq', 'system', 'user');
    expect(answerKey('gemini', 'system', 'user')).not.toBe(base);
    expect(answerKey('groq', 'other', 'user')).not.toBe(base);
    expect(answerKey('groq', 'system', 'other')).not.toBe(base);
  });

  it('does not mix up where one part ends and the next begins', () => {
    expect(answerKey('groq', 'ab', 'c')).not.toBe(answerKey('groq', 'a', 'bc'));
  });
});

describe('AnswerCache', () => {
  const tempPath = async () => join(await mkdtemp(join(tmpdir(), 'answers-')), 'sub', 'a.json');

  it('returns nothing for an answer that was never saved, even before the file exists', async () => {
    const cache = new AnswerCache(await tempPath());
    expect(await cache.has('k')).toBe(false);
    expect(await cache.get('k')).toBeUndefined();
  });

  it('keeps a saved answer, and a new cache object reads it back from the file', async () => {
    const path = await tempPath();
    await new AnswerCache(path).set('k', { text: 'an answer [1]', model: 'groq:x' });

    const again = new AnswerCache(path);
    expect(await again.get('k')).toEqual({ text: 'an answer [1]', model: 'groq:x' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toHaveProperty('k');
  });

  it('keeps earlier answers when a new one is added', async () => {
    const cache = new AnswerCache(await tempPath());
    await cache.set('a', { text: 'one', model: 'm' });
    await cache.set('b', { text: 'two', model: 'm' });
    expect((await cache.get('a'))?.text).toBe('one');
    expect((await cache.get('b'))?.text).toBe('two');
  });
});
