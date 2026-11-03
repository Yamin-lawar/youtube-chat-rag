/**
 * Some models (gpt-oss) write citations as 【1】 or 【1†L1-L4】 whatever the prompt says.
 * This turns them into plain [1] so the UI only has to understand one format.
 */
export function normalizeCitations(text: string): string {
  return text.replace(/【(\d+)[^】]*】/g, '[$1]');
}

const CITATION_OPEN = '【';

/**
 * The streaming version of normalizeCitations. A citation can arrive split across tokens
 * ("【", "1", "】"), so text from an unclosed 【 is held back until its 】 arrives.
 */
export async function* normalizeCitationStream(
  tokens: AsyncIterable<string>,
): AsyncGenerator<string> {
  let held = '';

  for await (const token of tokens) {
    held += token;

    const open = held.lastIndexOf(CITATION_OPEN);
    const hasUnclosed = open !== -1 && !held.includes('】', open);
    const ready = hasUnclosed ? held.slice(0, open) : held;
    held = hasUnclosed ? held.slice(open) : '';

    if (ready) yield normalizeCitations(ready);
  }

  // The stream ended inside an unfinished citation. Send what we have rather than lose it.
  if (held) yield held;
}
