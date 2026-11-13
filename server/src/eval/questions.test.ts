import { describe, expect, it } from 'vitest';
import { selectQuestions } from './questions.js';
import type { EvalQuestion } from './types.js';

const question = (id: string): EvalQuestion => ({
  id,
  type: 'fact',
  question: `Question ${id}?`,
  youtubeIds: ['abc123DEF45'],
  evidence: [{ youtubeId: 'abc123DEF45', quote: 'a quote' }],
});

const all = ['q01', 'q02', 'q03', 'q04', 'q05'].map(question);
const ids = (questions: EvalQuestion[]) => questions.map((q) => q.id);

describe('selectQuestions', () => {
  it('picks one question by id', () => {
    expect(ids(selectQuestions(all, 'q03'))).toEqual(['q03']);
  });

  it('picks a range, both ends included', () => {
    expect(ids(selectQuestions(all, 'q02-q04'))).toEqual(['q02', 'q03', 'q04']);
  });

  it('mixes ids and ranges, in file order and without repeats', () => {
    expect(ids(selectQuestions(all, 'q05, q01-q02, q02'))).toEqual(['q01', 'q02', 'q05']);
  });

  it('refuses an unknown id, so a typo does not quietly score fewer questions', () => {
    expect(() => selectQuestions(all, 'q09')).toThrow(/q09/);
    expect(() => selectQuestions(all, 'q02-q99')).toThrow(/q99/);
  });

  it('refuses a range that runs backwards or cannot be read', () => {
    expect(() => selectQuestions(all, 'q04-q02')).toThrow(/backwards/);
    expect(() => selectQuestions(all, 'q02-')).toThrow(/Cannot read/);
    expect(() => selectQuestions(all, '')).toThrow();
  });
});
