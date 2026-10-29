import { describe, expect, it } from 'vitest';
import { parseYoutubeId } from './youtube.js';

describe('parseYoutubeId', () => {
  const id = 'JljlsOJmlCA';

  it.each([
    [`https://www.youtube.com/watch?v=${id}`],
    [`https://youtube.com/watch?v=${id}&t=30s`],
    [`https://m.youtube.com/watch?v=${id}`],
    [`https://youtu.be/${id}`],
    [`https://youtu.be/${id}?si=abc`],
    [`https://www.youtube.com/shorts/${id}`],
    [`https://www.youtube.com/embed/${id}`],
    [`https://www.youtube.com/live/${id}`],
    [`  https://www.youtube.com/watch?v=${id}  `],
  ])('extracts the id from %s', (input) => {
    expect(parseYoutubeId(input)).toBe(id);
  });

  it.each([
    ['not a url'],
    [''],
    ['https://example.com/watch?v=JljlsOJmlCA'],
    ['https://www.youtube.com/watch'],
    ['https://www.youtube.com/watch?v=short'],
    ['https://www.youtube.com/@somechannel'],
  ])('returns null for %s', (input) => {
    expect(parseYoutubeId(input)).toBeNull();
  });
});
