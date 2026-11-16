/**
 * The best-ranked chunks that fit in a text budget, counted in characters.
 *
 * "Top 10" means 10 000 characters for 1000-character chunks and 20 000 for 2000-character ones,
 * so a bigger chunk looks better just by handing the answer model more text. Counting in
 * characters makes chunk sizes comparable. The first chunk is always taken, even when it is
 * longer than the budget, and the list stops at the first chunk that does not fit.
 */
export function takeWithinBudget<T extends { text: string }>(ranked: T[], characters: number): T[] {
  const taken: T[] = [];
  let used = 0;
  for (const chunk of ranked) {
    if (taken.length > 0 && used + chunk.text.length > characters) break;
    taken.push(chunk);
    used += chunk.text.length;
  }
  return taken;
}
