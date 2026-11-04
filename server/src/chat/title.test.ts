import { describe, expect, it } from 'vitest';
import { titleFromQuestion } from './title.js';

describe('titleFromQuestion', () => {
  it('uses a short question as it is', () => {
    expect(titleFromQuestion('How much power is needed?')).toBe('How much power is needed?');
  });

  it('collapses line breaks and extra spaces', () => {
    expect(titleFromQuestion('  what\n\nis   this ')).toBe('what is this');
  });

  it('cuts a long question and marks the cut', () => {
    const title = titleFromQuestion('a'.repeat(200));
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });
});
