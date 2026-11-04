import { describe, expect, it } from 'vitest';
import { formatTimestamp, youtubeLink } from './format';

describe('formatTimestamp', () => {
  it('formats minutes and seconds', () => expect(formatTimestamp(83_000)).toBe('1:23'));
  it('adds hours when needed', () => expect(formatTimestamp(3_725_000)).toBe('1:02:05'));
});

describe('youtubeLink', () => {
  it('opens the video at the start second', () => {
    expect(youtubeLink('abc123DEF45', 273_400)).toBe(
      'https://www.youtube.com/watch?v=abc123DEF45&t=273s',
    );
  });
});
