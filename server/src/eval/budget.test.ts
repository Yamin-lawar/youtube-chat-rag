import { describe, expect, it } from 'vitest';
import { takeWithinBudget } from './budget.js';

const chunk = (length: number) => ({ text: 'x'.repeat(length) });

describe('takeWithinBudget', () => {
  it('takes chunks in rank order until the next one would not fit', () => {
    const ranked = [chunk(400), chunk(400), chunk(400)];
    expect(takeWithinBudget(ranked, 1000)).toHaveLength(2);
  });

  it('takes more small chunks than big ones for the same budget', () => {
    expect(
      takeWithinBudget(
        Array.from({ length: 30 }, () => chunk(500)),
        10_000,
      ),
    ).toHaveLength(20);
    expect(
      takeWithinBudget(
        Array.from({ length: 30 }, () => chunk(2000)),
        10_000,
      ),
    ).toHaveLength(5);
  });

  it('always takes the first chunk, even when it is longer than the budget', () => {
    expect(takeWithinBudget([chunk(5000), chunk(10)], 1000)).toHaveLength(1);
  });

  it('stops at the first chunk that does not fit, even if a later one is small enough', () => {
    expect(takeWithinBudget([chunk(600), chunk(600), chunk(10)], 1000)).toHaveLength(1);
  });

  it('returns nothing for an empty list', () => {
    expect(takeWithinBudget([], 1000)).toEqual([]);
  });
});
