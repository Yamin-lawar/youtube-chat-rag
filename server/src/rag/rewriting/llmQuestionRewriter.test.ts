import { describe, expect, it, vi } from 'vitest';
import { LlmQuestionRewriter, cleanRewrite, type TextModel } from './llmQuestionRewriter.js';
import type { ChatTurn } from './types.js';

// Tests do not need the prompt printed to the terminal.
const quiet = { log: () => {} };

const history: ChatTurn[] = [
  { role: 'user', content: 'How much power do data centers need?' },
  { role: 'assistant', content: 'About 1 GW each.' },
];

function modelReplying(text: string): TextModel & { invoke: ReturnType<typeof vi.fn> } {
  return { invoke: vi.fn(async () => ({ content: text })) };
}

function failingModel(): TextModel {
  return {
    invoke: async () => {
      throw new Error('503 high demand');
    },
  };
}

describe('LlmQuestionRewriter', () => {
  it('skips the model when there is no history', async () => {
    const model = modelReplying('should not be used');
    const rewriter = new LlmQuestionRewriter([{ name: 'a', model }], quiet);

    expect(await rewriter.rewrite('What is this about?', [])).toBe('What is this about?');
    expect(model.invoke).not.toHaveBeenCalled();
  });

  it('returns the rewritten question', async () => {
    const rewriter = new LlmQuestionRewriter(
      [{ name: 'a', model: modelReplying('How much power do data centers need in China?') }],
      quiet,
    );
    expect(await rewriter.rewrite('and in China?', history)).toBe(
      'How much power do data centers need in China?',
    );
  });

  it('tries the next model when the first one fails', async () => {
    const rewriter = new LlmQuestionRewriter(
      [
        { name: 'down', model: failingModel() },
        { name: 'up', model: modelReplying('Standalone version') },
      ],
      quiet,
    );
    expect(await rewriter.rewrite('and in China?', history)).toBe('Standalone version');
  });

  it('falls back to the original question when every model fails', async () => {
    const rewriter = new LlmQuestionRewriter(
      [
        { name: 'a', model: failingModel() },
        { name: 'b', model: failingModel() },
      ],
      quiet,
    );
    expect(await rewriter.rewrite('and in China?', history)).toBe('and in China?');
  });
});

describe('LlmQuestionRewriter logging', () => {
  it('prints the prompt it sends and the result', async () => {
    const lines: string[] = [];
    const rewriter = new LlmQuestionRewriter(
      [{ name: 'a', model: modelReplying('Standalone version') }],
      { log: (line) => lines.push(line) },
    );

    await rewriter.rewrite('and in China?', history);

    expect(lines[0]).toContain('User: How much power do data centers need?');
    expect(lines[0]).toContain('Last message: and in China?');
    expect(lines[1]).toContain('"and in China?" -> "Standalone version"');
  });
});

describe('LlmQuestionRewriter timeout', () => {
  it('gives up on a model that does not answer in time and tries the next one', async () => {
    const hanging: TextModel = {
      invoke: (_messages, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('timed out')));
        }),
    };
    const rewriter = new LlmQuestionRewriter(
      [
        { name: 'slow', model: hanging },
        { name: 'fast', model: modelReplying('Standalone version') },
      ],
      { ...quiet, timeoutMs: 20 },
    );

    expect(await rewriter.rewrite('and in China?', history)).toBe('Standalone version');
  });
});

describe('cleanRewrite', () => {
  it('strips quotes and a label', () => {
    expect(cleanRewrite('Standalone question: "Why is it a problem?"')).toBe(
      'Why is it a problem?',
    );
  });

  it('keeps only the first line', () => {
    expect(cleanRewrite('Why is it a problem?\n\nBecause power is scarce.')).toBe(
      'Why is it a problem?',
    );
  });

  it('rejects a reply that is far too long to be a question', () => {
    expect(cleanRewrite('x'.repeat(500))).toBe('');
  });

  it('returns an empty string for an empty reply', () => {
    expect(cleanRewrite('  \n ')).toBe('');
  });
});
