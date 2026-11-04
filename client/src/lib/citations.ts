export const CITATION_PREFIX = '#cite-';

/**
 * Turns "[1]" in an answer into a markdown link to "#cite-1", which the Markdown component
 * then draws as a clickable badge. "[1](...)" is left alone because it is already a link.
 */
export function linkCitations(text: string): string {
  return text.replace(/\[(\d{1,2})\](?!\()/g, `[$1](${CITATION_PREFIX}$1)`);
}

/** "#cite-3" -> 3, anything else -> null. */
export function citationNumber(href: string | undefined): number | null {
  if (!href?.startsWith(CITATION_PREFIX)) return null;
  const number = Number(href.slice(CITATION_PREFIX.length));
  return Number.isInteger(number) ? number : null;
}
