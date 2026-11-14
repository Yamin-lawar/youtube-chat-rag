import { describe, expect, it } from 'vitest';
import type { NamedModel } from '../rewriting/llmQuestionRewriter.js';
import { LlmQueryExpander, cleanPassage, cleanVariants } from './llmQueryExpander.js';

/** A model that replies with the given texts in turn, or throws when given an Error. */
function fakeModel(
  name: string,
  ...replies: Array<string | Error>
): NamedModel & { calls: number } {
  const model = {
    name,
    calls: 0,
    model: {
      invoke: () => {
        const reply = replies[Math.min(model.calls++, replies.length - 1)]!;
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve({ content: reply });
      },
    },
  };
  return model;
}

describe('cleanPassage', () => {
  it('joins lines and tidies whitespace', () => {
    expect(cleanPassage('  The  firm\nrents GPUs.  ')).toBe('The firm rents GPUs.');
  });

  it('refuses a reply that is far too long to be a short passage', () => {
    expect(cleanPassage('word '.repeat(300))).toBe('');
  });
});

describe('cleanVariants', () => {
  it('removes numbering, bullets, labels and quotes', () => {
    const raw =
      '1. "What is a neo cloud firm?"\n- neo cloud GPU rental\nQuery 3: A neo cloud rents out GPUs.';
    expect(cleanVariants(raw, 'What is a neo cloud?')).toEqual([
      'What is a neo cloud firm?',
      'neo cloud GPU rental',
      'A neo cloud rents out GPUs.',
    ]);
  });

  it('drops blank lines, repeats and a copy of the question, and keeps at most three', () => {
    const raw = 'What is a neo cloud?\n\nalpha\nALPHA\nbeta\ngamma\ndelta';
    expect(cleanVariants(raw, 'what is a neo cloud?')).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('LlmQueryExpander', () => {
  it('returns the cleaned passage for the hyde prompt', async () => {
    const expander = new LlmQueryExpander('hyde', [fakeModel('a', ' A passage. ')]);
    expect(await expander.expand('q')).toEqual(['A passage.']);
  });

  it('returns the variants for the multi prompt', async () => {
    const expander = new LlmQueryExpander('multi', [fakeModel('a', 'one\ntwo\nthree')]);
    expect(await expander.expand('q')).toEqual(['one', 'two', 'three']);
  });

  it('tries the next model when the first fails or gives nothing usable', async () => {
    const first = fakeModel('a', new Error('503'));
    const second = fakeModel('b', '   ');
    const third = fakeModel('c', 'A passage.');
    expect(await new LlmQueryExpander('hyde', [first, second, third]).expand('q')).toEqual([
      'A passage.',
    ]);
    expect([first.calls, second.calls, third.calls]).toEqual([1, 1, 1]);
  });

  it('throws, naming every model, when none gives a usable reply', async () => {
    const expander = new LlmQueryExpander('hyde', [
      fakeModel('a', new Error('429')),
      fakeModel('b', ''),
    ]);
    await expect(expander.expand('q')).rejects.toThrow(/a: 429[\s\S]*b: unusable reply/);
  });

  it('has an id that changes with the prompt kind and the models', () => {
    const hyde = new LlmQueryExpander('hyde', [fakeModel('a', 'x')]).id;
    expect(new LlmQueryExpander('multi', [fakeModel('a', 'x')]).id).not.toBe(hyde);
    expect(new LlmQueryExpander('hyde', [fakeModel('b', 'x')]).id).not.toBe(hyde);
  });
});
