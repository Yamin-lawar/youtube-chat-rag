import { describe, expect, it } from 'vitest';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { buildUserPrompt, formatTimestamp } from './prompt.js';

describe('formatTimestamp', () => {
  it('formats minutes and seconds', () => {
    expect(formatTimestamp(83_000)).toBe('1:23');
    expect(formatTimestamp(5_000)).toBe('0:05');
  });

  it('adds hours for long videos', () => {
    expect(formatTimestamp(3_725_000)).toBe('1:02:05');
  });
});

describe('buildUserPrompt', () => {
  const chunks: ScoredChunk[] = [
    { youtubeId: 'aaa', chunkIndex: 0, text: 'first text', startMs: 0, endMs: 1, score: 0.8 },
    { youtubeId: 'bbb', chunkIndex: 4, text: 'second text', startMs: 90_000, endMs: 2, score: 0.7 },
  ];

  it('numbers the excerpts in order and ends with the question', () => {
    const prompt = buildUserPrompt('what happened?', chunks);
    expect(prompt).toContain('[1] (video aaa, at 0:00)\nfirst text');
    expect(prompt).toContain('[2] (video bbb, at 1:30)\nsecond text');
    expect(prompt.endsWith('Question: what happened?')).toBe(true);
  });
});
