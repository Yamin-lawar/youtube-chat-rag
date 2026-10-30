import { XMLParser } from 'fast-xml-parser';
import type { TranscriptSegment } from './types.js';

// A word with attributes parses to an object; a bare <s>word</s> parses to a plain string.
type TimedTextWord = string | { '#text'?: string };

interface TimedTextParagraph {
  '@_t'?: string;
  '@_d'?: string;
  s?: TimedTextWord[];
  '#text'?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Words carry their own leading space (" all,"), so trimming would glue words together.
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === 'p' || name === 's',
});

// YouTube sometimes double-encodes apostrophes and quotes (&amp;#39; becomes &#39; after XML decoding).
function decodeLeftoverEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Converts YouTube's timed-text XML (format 3) into transcript segments.
 * Each <p> is one caption line; its words are in <s> children.
 */
export function parseTimedText(xml: string): TranscriptSegment[] {
  const document = parser.parse(xml) as {
    timedtext?: { body?: { p?: TimedTextParagraph[] } };
  };

  const paragraphs = document.timedtext?.body?.p ?? [];
  const segments: TranscriptSegment[] = [];

  for (const paragraph of paragraphs) {
    // Auto-generated captions wrap each word in <s>; manual captions put plain text in <p>.
    const rawText = paragraph.s
      ? paragraph.s
          .map((word) => (typeof word === 'string' ? word : (word['#text'] ?? '')))
          .join('')
      : (paragraph['#text'] ?? '');

    const text = decodeLeftoverEntities(rawText).replace(/\s+/g, ' ').trim();
    if (!text) continue; // YouTube inserts empty lines as spacers

    segments.push({
      text,
      startMs: Number(paragraph['@_t'] ?? 0),
      durationMs: Number(paragraph['@_d'] ?? 0),
    });
  }

  return segments;
}
