import { describe, expect, it } from 'vitest';
import { parseEventBlock, splitEvents } from './sse';

describe('parseEventBlock', () => {
  it('reads the event name and JSON data', () => {
    expect(parseEventBlock('event: token\ndata: {"text":"Hi"}')).toEqual({
      event: 'token',
      data: { text: 'Hi' },
    });
  });

  it('ignores blocks without data', () => {
    expect(parseEventBlock(': keep-alive')).toBeNull();
  });
});

describe('splitEvents', () => {
  it('returns complete events and keeps the unfinished rest', () => {
    const { events, rest } = splitEvents(
      'event: token\ndata: {"text":"a"}\n\nevent: token\ndata: {"te',
    );
    expect(events).toHaveLength(1);
    expect(rest).toBe('event: token\ndata: {"te');
  });

  it('handles several events in one chunk', () => {
    const { events, rest } = splitEvents(
      'event: start\ndata: {}\n\nevent: token\ndata: {"text":"a"}\n\n',
    );
    expect(events.map((e) => e.event)).toEqual(['start', 'token']);
    expect(rest).toBe('');
  });
});
