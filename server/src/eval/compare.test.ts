import { describe, expect, it } from 'vitest';
import { compareRuns, formatComparison } from './compare.js';
import { CUTOFFS, type QuestionScore } from './metrics.js';
import { buildRunRecord, type ScoredQuestion } from './runRecord.js';

/** A score as if the first correct chunk were at `firstRank` and nothing else were correct. */
function scoreAt(firstRank: number | null): QuestionScore {
  const byCutoff = (value: (k: number) => number) =>
    Object.fromEntries(CUTOFFS.map((k) => [k, value(k)]));
  const hit = (k: number) => (firstRank !== null && firstRank <= k ? 1 : 0);
  return {
    firstRank,
    reciprocalRank: firstRank === null ? 0 : 1 / firstRank,
    hitAt: byCutoff(hit),
    recallAt: byCutoff(hit),
    precisionAt: byCutoff((k) => hit(k) / k),
    bestPrecisionAt: byCutoff((k) => 1 / k),
    ndcgAt: byCutoff(hit),
  };
}

const question = (id: string, firstRank: number | null): ScoredQuestion => ({
  id,
  question: `Question ${id}?`,
  type: 'fact',
  score: scoreAt(firstRank),
  topScore: 0.7,
  keptRecall: 1,
  keptCount: 8,
});

const settings = { search: 'dense', topK: 12, maxScoreDrop: 0.12, chunking: 'recursive' };
const run = (label: string, ranks: Record<string, number | null>) =>
  buildRunRecord(
    { label, commit: null, settings, now: new Date('2026-01-01T00:00:00Z') },
    Object.entries(ranks).map(([id, rank]) => question(id, rank)),
    [0.6],
  );

describe('buildRunRecord', () => {
  it('averages each metric over the questions', () => {
    const record = run('a', { q1: 1, q2: null });
    expect(record.metrics.hitRate[1]).toBe(0.5);
    expect(record.mrr).toBe(0.5);
    expect(record.questions['q2']?.firstRank).toBeNull();
    expect(record.topScores.unanswerableMax).toBe(0.6);
  });
});

describe('compareRuns', () => {
  it('sorts questions into improved and worse by where the first correct chunk is', () => {
    const before = run('before', { q1: 3, q2: 1, q3: null, q4: 2 });
    const after = run('after', { q1: 1, q2: 2, q3: 5, q4: 2 });
    const { improved, worse } = compareRuns(before, after);

    expect(improved.map((c) => c.id)).toEqual(['q1', 'q3']);
    expect(worse.map((c) => c.id)).toEqual(['q2']);
  });

  it('counts losing the correct chunk as worse', () => {
    const { worse } = compareRuns(run('b', { q1: 4 }), run('a', { q1: null }));
    expect(worse).toEqual([{ id: 'q1', question: 'Question q1?', before: 4, after: null }]);
  });

  it('warns when the two runs used different questions', () => {
    const comparison = compareRuns(run('b', { q1: 1 }), run('a', { q1: 1, q2: 1 }));
    expect(comparison.sameQuestions).toBe(false);
    expect(formatComparison(comparison)).toContain('different questions');
  });
});

describe('formatComparison', () => {
  it('shows the change in points and the settings that differ', () => {
    const before = run('baseline', { q1: 2, q2: 2 });
    const after = {
      ...run('hybrid', { q1: 1, q2: 2 }),
      settings: { ...settings, search: 'hybrid', maxScoreDrop: null },
    };
    const text = formatComparison(compareRuns(before, after));

    expect(text).toContain('"baseline"');
    expect(text).toContain('search dense -> hybrid');
    expect(text).toContain('maxScoreDrop 0.12 -> none');
    expect(text).toContain('50% (+50)'); // hit rate at top 1 went from 0% to 50%
    expect(text).toContain('MRR 0.500 -> 0.750 (+0.250)');
  });

  it('names the search strategy of both runs in the header, so a dense run is not taken for hybrid', () => {
    const before = run('baseline', { q1: 1 });
    const after = {
      ...run('weighted', { q1: 1 }),
      settings: { ...settings, search: 'hybrid', sparseWeight: 0.5 },
    };
    const lines = formatComparison(compareRuns(before, after)).split('\n');

    expect(lines[0]).toContain('(dense, 2026-01-01');
    expect(lines[1]).toContain('(hybrid 0.5, 2026-01-01');
  });

  it('shows a sparse weight that only one run has as "none" on the other side', () => {
    const before = run('baseline', { q1: 1 });
    const after = {
      ...run('weighted', { q1: 1 }),
      settings: { ...settings, search: 'hybrid', sparseWeight: 0.5 },
    };
    expect(formatComparison(compareRuns(before, after))).toContain('sparseWeight none -> 0.5');
  });

  it('reports no changed settings for two dense runs', () => {
    const text = formatComparison(compareRuns(run('a', { q1: 1 }), run('b', { q1: 1 })));
    expect(text).toContain('Settings changed: none');
  });

  it('names the reranker in the header and shows it as "none" on the run that had none', () => {
    const before = run('baseline', { q1: 1 });
    const after = {
      ...run('reranked', { q1: 1 }),
      settings: { ...settings, reranker: 'minilm', rerankCandidates: 20 },
    };
    const text = formatComparison(compareRuns(before, after));
    expect(text).toContain('(dense + minilm, 2026-01-01');
    expect(text).toContain('reranker none -> minilm');
    expect(text).toContain('rerankCandidates none -> 20');
  });

  it('names the expansion in the header, before the reranker, and shows "none" on the run without', () => {
    const before = run('baseline', { q1: 1 });
    const after = {
      ...run('expanded', { q1: 1 }),
      settings: { ...settings, expansion: 'hyde', reranker: 'bge-m3', rerankCandidates: 20 },
    };
    const text = formatComparison(compareRuns(before, after));
    expect(text).toContain('(dense + expansion hyde + bge-m3, 2026-01-01');
    expect(text).toContain('expansion none -> hyde');
  });
});
