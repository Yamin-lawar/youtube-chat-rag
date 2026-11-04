import { describe, expect, it } from 'vitest';
import { JobQueue } from './jobQueue.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('JobQueue', () => {
  it('runs jobs one at a time, in order', async () => {
    const log: string[] = [];
    const queue = new JobQueue(async (key) => {
      log.push(`start ${key}`);
      await tick();
      log.push(`end ${key}`);
    });

    queue.add('a');
    queue.add('b');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('ignores a key that is already waiting', async () => {
    const runs: string[] = [];
    const queue = new JobQueue(async (key) => {
      runs.push(key);
      await tick();
    });

    queue.add('a');
    queue.add('a');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(runs).toEqual(['a']);
  });

  it('accepts the same key again once it has finished', async () => {
    const runs: string[] = [];
    const queue = new JobQueue(async (key) => {
      runs.push(key);
    });

    queue.add('a');
    await tick();
    queue.add('a');
    await tick();

    expect(runs).toEqual(['a', 'a']);
  });

  it('keeps going after a job throws', async () => {
    const runs: string[] = [];
    const queue = new JobQueue(async (key) => {
      runs.push(key);
      if (key === 'bad') throw new Error('boom');
    });

    queue.add('bad');
    queue.add('good');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(runs).toEqual(['bad', 'good']);
  });
});
