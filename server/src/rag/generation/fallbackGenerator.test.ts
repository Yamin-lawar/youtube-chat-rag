import { describe, expect, it } from 'vitest';
import { FallbackGenerator } from './fallbackGenerator.js';
import type { Answer, Generator } from './types.js';

function working(name: string): Generator {
  return {
    name,
    generate: async (): Promise<Answer> => ({ text: `from ${name}`, sources: [], model: name }),
  };
}

function broken(name: string): Generator {
  return {
    name,
    generate: async () => {
      throw new Error('503 high demand');
    },
  };
}

describe('FallbackGenerator', () => {
  it('uses the first generator when it works', async () => {
    const answer = await new FallbackGenerator([working('a'), working('b')]).generate('q', []);
    expect(answer.model).toBe('a');
  });

  it('falls back to the next generator when one fails', async () => {
    const answer = await new FallbackGenerator([broken('a'), working('b')]).generate('q', []);
    expect(answer.model).toBe('b');
  });

  it('reports every failure when all generators fail', async () => {
    const generator = new FallbackGenerator([broken('a'), broken('b')]);
    await expect(generator.generate('q', [])).rejects.toThrow(/a: 503[\s\S]*b: 503/);
  });
});
