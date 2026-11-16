import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Transcript } from '../transcript/types.js';
import type { Chunk, Chunker } from './types.js';

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;

export interface RecursiveChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Splits the transcript into roughly equal pieces by character count, preferring to break
 * at paragraph, line, then word boundaries (LangChain's recursive splitter).
 *
 * The splitter works on plain text, so it does not know about timestamps. We join the
 * caption segments into one string, remember where each segment starts, and afterwards
 * look up which segments each chunk covers.
 */
export class RecursiveChunker implements Chunker {
  /**
   * Names the collection the chunks are stored in, so it must differ when the settings differ,
   * or a 500-character run would be mixed into the 1000-character one. The default keeps the
   * plain name "recursive", so the collection and the saved runs made before this stay valid.
   */
  readonly name: string;
  private readonly splitter: RecursiveCharacterTextSplitter;

  constructor({
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
  }: RecursiveChunkerOptions = {}) {
    this.splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
    this.name =
      chunkSize === DEFAULT_CHUNK_SIZE && chunkOverlap === DEFAULT_CHUNK_OVERLAP
        ? 'recursive'
        : `recursive-${chunkSize}-${chunkOverlap}`;
  }

  async chunk(transcript: Transcript): Promise<Chunk[]> {
    const { segments } = transcript;

    // Build the full text and record the character offset where each segment begins.
    const segmentOffsets: number[] = [];
    let fullText = '';
    for (const segment of segments) {
      if (fullText) fullText += ' ';
      segmentOffsets.push(fullText.length);
      fullText += segment.text;
    }

    const pieces = await this.splitter.splitText(fullText);

    const chunks: Chunk[] = [];
    let searchFrom = 0;

    for (const [index, text] of pieces.entries()) {
      // Logic to get exact start and end time of chunk text into video
      const start = fullText.indexOf(text, searchFrom);
      if (start === -1) {
        throw new Error(`Chunk ${index} was not found in the transcript text`);
      }
      searchFrom = start + 1;

      const firstSegment = segmentAt(segmentOffsets, start);
      const lastSegment = segmentAt(segmentOffsets, start + text.length - 1);
      const last = segments[lastSegment];
      const first = segments[firstSegment];
      if (!first || !last) throw new Error(`Chunk ${index} maps outside the transcript`);

      chunks.push({
        index,
        text,
        startMs: first.startMs,
        endMs: last.startMs + last.durationMs,
      });
    }
    return chunks;
  }
}

/** Index of the segment that contains the given character position (binary search). */
function segmentAt(offsets: number[], position: number): number {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((offsets[middle] ?? Infinity) <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}
