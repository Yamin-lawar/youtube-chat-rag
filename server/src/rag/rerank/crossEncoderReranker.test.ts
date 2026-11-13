import { describe, expect, it } from 'vitest';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { CrossEncoderReranker } from './crossEncoderReranker.js';
import type { PairScorer } from './types.js';

function chunk(chunkIndex: number, score = 0.5): ScoredChunk {
  return {
    youtubeId: 'abc123DEF45',
    chunkIndex,
    text: `chunk ${chunkIndex}`,
    startMs: 0,
    endMs: 1000,
    score,
  };
}

/** A scorer that gives each text the number listed for it, and remembers what it was asked. */
function scorer(byText: Record<string, number>) {
  const asked: { question: string; texts: string[] }[] = [];
  const score: PairScorer = (question, texts) => {
    asked.push({ question, texts });
    return Promise.resolve(texts.map((text) => byText[text] ?? 0));
  };
  return { score, asked };
}

const indexes = (chunks: ScoredChunk[]) => chunks.map((c) => c.chunkIndex);

describe('CrossEncoderReranker', () => {
  it('sorts the chunks by the scorer, best first', async () => {
    const { score } = scorer({ 'chunk 1': -3, 'chunk 2': 4, 'chunk 3': 1 });
    const reranked = await new CrossEncoderReranker('test', score).rerank('q', [
      chunk(1),
      chunk(2),
      chunk(3),
    ]);
    expect(indexes(reranked)).toEqual([2, 3, 1]);
  });

  it("replaces each score with the reranker's, and keeps the text and times", async () => {
    const { score } = scorer({ 'chunk 7': 2.5 });
    const [only] = await new CrossEncoderReranker('test', score).rerank('q', [chunk(7, 0.9)]);
    expect(only).toMatchObject({ chunkIndex: 7, text: 'chunk 7', startMs: 0, endMs: 1000 });
    expect(only?.score).toBe(2.5);
  });

  it('keeps the search order for chunks with the same score', async () => {
    const { score } = scorer({});
    const reranked = await new CrossEncoderReranker('test', score).rerank('q', [
      chunk(5),
      chunk(3),
      chunk(9),
    ]);
    expect(indexes(reranked)).toEqual([5, 3, 9]);
  });

  it('gives the scorer the question once and the chunk texts in the search order', async () => {
    const { score, asked } = scorer({});
    await new CrossEncoderReranker('test', score).rerank('What is RPO?', [chunk(2), chunk(1)]);
    expect(asked).toEqual([{ question: 'What is RPO?', texts: ['chunk 2', 'chunk 1'] }]);
  });

  it('returns nothing, and does not call the scorer, when there are no chunks', async () => {
    const { score, asked } = scorer({});
    expect(await new CrossEncoderReranker('test', score).rerank('q', [])).toEqual([]);
    expect(asked).toHaveLength(0);
  });

  it('does not change the list it is given', async () => {
    const { score } = scorer({ 'chunk 2': 9 });
    const input = [chunk(1, 0.7), chunk(2, 0.6)];
    await new CrossEncoderReranker('test', score).rerank('q', input);
    expect(input.map((c) => c.score)).toEqual([0.7, 0.6]);
    expect(indexes(input)).toEqual([1, 2]);
  });

  it('fails clearly when the scorer returns the wrong number of scores', async () => {
    const broken: PairScorer = () => Promise.resolve([1]);
    await expect(
      new CrossEncoderReranker('test', broken).rerank('q', [chunk(1), chunk(2)]),
    ).rejects.toThrow(/1 scores for 2 chunks/);
  });

  it('has the name it was given', () => {
    expect(new CrossEncoderReranker('minilm', () => Promise.resolve([])).name).toBe('minilm');
  });
});
