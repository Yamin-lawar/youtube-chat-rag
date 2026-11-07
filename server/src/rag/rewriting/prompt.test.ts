import { describe, expect, it } from 'vitest';
import { MAX_HISTORY_MESSAGES, buildRewritePrompt } from './prompt.js';

describe('buildRewritePrompt', () => {
  it('lists the history, then the last message', () => {
    const prompt = buildRewritePrompt('and in China?', [
      { role: 'user', content: 'How much power do data centers need?' },
      { role: 'assistant', content: 'About 1 GW each.' },
    ]);
    expect(prompt).toBe(
      'Chat history:\nUser: How much power do data centers need?\nAssistant: About 1 GW each.' +
        '\n\nLast message: and in China?\n\nStandalone question:',
    );
  });

  it('removes [1]-style citations from earlier answers', () => {
    const prompt = buildRewritePrompt('why?', [
      { role: 'assistant', content: 'It is huge [1][2].' },
    ]);
    expect(prompt).toContain('Assistant: It is huge .');
    expect(prompt).not.toContain('[1]');
  });

  it('cuts very long turns', () => {
    const prompt = buildRewritePrompt('why?', [{ role: 'assistant', content: 'a'.repeat(5000) }]);
    expect(prompt.length).toBeLessThan(900);
    expect(prompt).toContain('…');
  });

  it('only keeps the most recent messages', () => {
    const history = Array.from({ length: MAX_HISTORY_MESSAGES + 5 }, (_, i) => ({
      role: 'user' as const,
      content: `message ${i}`,
    }));
    const prompt = buildRewritePrompt('next', history);
    expect(prompt).not.toContain('message 0\n');
    expect(prompt).toContain(`message ${MAX_HISTORY_MESSAGES + 4}`);
  });
});
