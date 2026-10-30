import { describe, expect, it } from 'vitest';
import { parseTimedText } from './parseTimedText.js';

describe('parseTimedText', () => {
  it('joins word-level <s> elements into one segment with timing', () => {
    const xml = `<timedtext format="3"><body>
      <p t="80" d="5199"><s>Hey</s><s t="240"> all,</s><s t="720"> my</s></p>
    </body></timedtext>`;

    expect(parseTimedText(xml)).toEqual([{ text: 'Hey all, my', startMs: 80, durationMs: 5199 }]);
  });

  it('skips empty spacer paragraphs', () => {
    const xml = `<timedtext format="3"><body>
      <p t="0" d="100"><s>One</s></p>
      <p t="100" d="50">
      </p>
      <p t="150" d="100"><s>Two</s></p>
    </body></timedtext>`;

    expect(parseTimedText(xml).map((segment) => segment.text)).toEqual(['One', 'Two']);
  });

  it('reads plain text paragraphs (manual captions)', () => {
    const xml = `<timedtext format="3"><body><p t="1000" d="2000">Hello world</p></body></timedtext>`;

    expect(parseTimedText(xml)).toEqual([{ text: 'Hello world', startMs: 1000, durationMs: 2000 }]);
  });

  it('decodes leftover HTML entities', () => {
    const xml = `<timedtext format="3"><body><p t="0" d="10">it&amp;#39;s &amp;amp; done</p></body></timedtext>`;

    expect(parseTimedText(xml)[0]?.text).toBe("it's & done");
  });

  it('returns an empty list for a document without captions', () => {
    expect(parseTimedText('<timedtext format="3"><body></body></timedtext>')).toEqual([]);
  });
});
