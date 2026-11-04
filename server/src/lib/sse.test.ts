import { describe, expect, it } from 'vitest';
import { formatEvent } from './sse.js';

describe('formatEvent', () => {
  it('writes the event name, a JSON data line and a blank line', () => {
    expect(formatEvent('token', { text: 'Hi' })).toBe('event: token\ndata: {"text":"Hi"}\n\n');
  });

  it('keeps newlines inside the text from breaking the event', () => {
    // JSON turns a real newline into \n, so the data stays on one line.
    const output = formatEvent('token', { text: 'a\nb' });
    expect(output.split('\n')).toHaveLength(4);
  });
});
