import { describe, expect, it } from 'vitest';
import type { Answer, AnswerStream, Generator, Source } from '../rag/generation/types.js';
import type { ScoredChunk } from '../rag/vectorstore/qdrantChunkStore.js';
import type { ChatTurn, QuestionRewriter } from '../rag/rewriting/types.js';
import {
  GENERIC_ERROR,
  answerQuestion,
  type AnswerDependencies,
  type MessagePatch,
} from './answerQuestion.js';

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

const identityRewriter: QuestionRewriter = { rewrite: async (question) => question };

function setup(
  generator: Generator,
  retrieve: AnswerDependencies['retrieve'] = async () => [chunk],
  rewriter: QuestionRewriter = identityRewriter,
  history: ChatTurn[] = [],
) {
  const saved: MessagePatch[] = [];
  const events: Array<{ event: string; data: unknown }> = [];
  const run = () =>
    answerQuestion(
      { question: 'question', youtubeIds: ['abc123DEF45'], history },
      {
        rewriter,
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
    expect(saved).toContainEqual({ model: 'fake:m', sources: [source] });
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

    // The search query is saved before retrieval, so a failed answer still shows what was searched.
    expect(saved).toEqual([{ searchQuery: 'question' }, { content: '', status: 'failed' }]);
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('searches and answers with the rewritten question, and saves it', async () => {
    const searched: string[] = [];
    const asked: string[] = [];
    const generator: Generator = {
      name: 'fake',
      stream: async (question) => {
        asked.push(question);
        return { sources: [source], model: 'm', tokens: tokensOf(['ok']) };
      },
      generate: (): Promise<Answer> => Promise.reject(new Error('not used')),
    };
    const rewriter: QuestionRewriter = {
      rewrite: async () => 'How much power do data centers need in China?',
    };
    const history: ChatTurn[] = [{ role: 'user', content: 'How much power do data centers need?' }];
    const { saved, run } = setup(
      generator,
      async (query) => {
        searched.push(query);
        return [chunk];
      },
      rewriter,
      history,
    );

    await run();

    expect(searched).toEqual(['How much power do data centers need in China?']);
    expect(asked).toEqual(['How much power do data centers need in China?']);
    expect(saved[0]).toEqual({ searchQuery: 'How much power do data centers need in China?' });
  });
});
