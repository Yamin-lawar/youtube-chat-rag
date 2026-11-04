import { describe, expect, it } from 'vitest';
import type { Answer, AnswerStream, Generator, Source } from '../rag/generation/types.js';
import type { ScoredChunk } from '../rag/vectorstore/qdrantChunkStore.js';
import { GENERIC_ERROR, answerQuestion, type MessagePatch } from './answerQuestion.js';

const source: Source = {
  number: 1,
  youtubeId: 'abc123DEF45',
  startMs: 0,
  endMs: 5000,
  snippet: 'x',
};
const chunk: ScoredChunk = {
  youtubeId: 'abc123DEF45',
  chunkIndex: 0,
  text: 'x',
  startMs: 0,
  endMs: 5000,
  score: 0.9,
};

async function* tokensThenFail(tokens: string[]): AsyncGenerator<string> {
  for (const token of tokens) yield token;
  throw new Error('connection lost');
}

async function* tokensOf(tokens: string[]): AsyncGenerator<string> {
  for (const token of tokens) yield token;
}

function generatorOf(stream: () => Promise<AnswerStream>): Generator {
  return {
    name: 'fake',
    stream,
    generate: (): Promise<Answer> => Promise.reject(new Error('not used')),
  };
}

function setup(generator: Generator, retrieve = async () => [chunk]) {
  const saved: MessagePatch[] = [];
  const events: Array<{ event: string; data: unknown }> = [];
  const run = () =>
    answerQuestion(
      'question',
      ['abc123DEF45'],
      {
        retrieve,
        generator,
        saveMessage: async (patch) => {
          saved.push(patch);
        },
      },
      (event, data) => events.push({ event, data }),
    );
  return { saved, events, run };
}

describe('answerQuestion', () => {
  it('streams sources, tokens and done, and saves the finished answer', async () => {
    const { saved, events, run } = setup(
      generatorOf(async () => ({
        sources: [source],
        model: 'fake:m',
        tokens: tokensOf(['Hel', 'lo']),
      })),
    );

    await run();

    expect(events.map((e) => e.event)).toEqual(['sources', 'token', 'token', 'done']);
    expect(saved.at(-1)).toEqual({ content: 'Hello', status: 'complete' });
    expect(saved[0]).toEqual({ model: 'fake:m', sources: [source] });
  });

  it('keeps the partial answer and reports an error when the stream breaks', async () => {
    const { saved, events, run } = setup(
      generatorOf(async () => ({
        sources: [source],
        model: 'm',
        tokens: tokensThenFail(['Part']),
      })),
    );

    await run();

    expect(saved.at(-1)).toEqual({ content: 'Part', status: 'failed' });
    expect(events.at(-1)).toEqual({ event: 'error', data: { message: GENERIC_ERROR } });
  });

  it('fails cleanly when retrieval throws, without leaking the real error', async () => {
    const { saved, events, run } = setup(
      generatorOf(async () => {
        throw new Error('not reached');
      }),
      async () => {
        throw new Error('429 secret details');
      },
    );

    await run();

    expect(saved).toEqual([{ content: '', status: 'failed' }]);
    expect(JSON.stringify(events)).not.toContain('secret');
  });
});
