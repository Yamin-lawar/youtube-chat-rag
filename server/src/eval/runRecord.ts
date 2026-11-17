import { CUTOFFS, mean, type QuestionScore } from './metrics.js';

/** Bump this when the shape below changes, so an old file is not read as a new one. */
export const RUN_RECORD_VERSION = 1;

export type MetricName = 'hitRate' | 'recall' | 'precision' | 'ndcg';

export const METRIC_LABELS: Record<MetricName, string> = {
  hitRate: 'Hit rate',
  recall: 'Recall@k',
  precision: 'Precision@k',
  ndcg: 'nDCG@k',
};

/** The knobs that change the numbers. Shown in a comparison so you know what you changed. */
export interface RunSettings {
  /** The search strategy: "dense" or "hybrid". */
  search: string;
  topK: number;
  /** Null when there is no margin and everything the search returns is kept. */
  maxScoreDrop: number | null;
  chunking: string;
  /** Only with parent-child retrieval: the chunking of the bigger chunks that are returned. */
  parent?: string;
  /** Hybrid only: the weight of the exact-word list against the meaning list (1). */
  sparseWeight?: number;
  /** Only when a reranker was used: its name and how many candidates it was given. */
  reranker?: string;
  rerankCandidates?: number;
  /** Only when query expansion was used: its mode (hyde, hyde+q or multi). */
  expansion?: string;
}

export interface QuestionResult {
  question: string;
  type: string;
  /** Position of the first correct chunk (1 = best), or null if none was returned. */
  firstRank: number | null;
  reciprocalRank: number;
}

/** Everything we keep from one eval run, so two runs can be compared later. */
export interface RunRecord {
  version: number;
  label: string;
  createdAt: string;
  commit: string | null;
  settings: RunSettings;
  answerableCount: number;
  /** Each metric averaged over the answerable questions, for each cutoff k. */
  metrics: Record<MetricName, Record<number, number>>;
  mrr: number;
  mrrByType: Record<string, number>;
  /** `chars` is missing from runs saved before it was recorded. */
  kept: { evidenceRecall: number; chunks: number; chars?: number };
  /** Only when the run used --budget: how the first N characters of results did. */
  budget?: { characters: number; hitRate: number; evidenceRecall: number; chunks: number };
  /** Null when there were no questions of that kind. */
  topScores: { answerableMin: number | null; unanswerableMax: number | null };
  questions: Record<string, QuestionResult>;
}

/** One scored answerable question, as the eval script produces it. */
export interface ScoredQuestion {
  id: string;
  question: string;
  type: string;
  score: QuestionScore;
  topScore: number;
  keptRecall: number;
  keptCount: number;
  keptChars: number;
  budget?: { chunks: number; recall: number };
}

export interface RunInfo {
  label: string;
  commit: string | null;
  settings: RunSettings;
  now?: Date;
  /** The --budget the run used, in characters. */
  budgetCharacters?: number;
}

function budgetSummary(characters: number, answerable: ScoredQuestion[]) {
  const budgets = answerable.flatMap((q) => (q.budget ? [q.budget] : []));
  return {
    characters,
    hitRate: mean(budgets.map((b) => (b.recall > 0 ? 1 : 0))),
    evidenceRecall: mean(budgets.map((b) => b.recall)),
    chunks: mean(budgets.map((b) => b.chunks)),
  };
}

export function buildRunRecord(
  info: RunInfo,
  answerable: ScoredQuestion[],
  unanswerableTopScores: number[],
): RunRecord {
  const atEachK = (pick: (score: QuestionScore, k: number) => number | undefined) =>
    Object.fromEntries(CUTOFFS.map((k) => [k, mean(answerable.map((q) => pick(q.score, k) ?? 0))]));

  const types = new Set(answerable.map((q) => q.type));
  const answerableTops = answerable.map((q) => q.topScore);

  return {
    version: RUN_RECORD_VERSION,
    label: info.label,
    createdAt: (info.now ?? new Date()).toISOString(),
    commit: info.commit,
    settings: info.settings,
    answerableCount: answerable.length,
    metrics: {
      hitRate: atEachK((s, k) => s.hitAt[k]),
      recall: atEachK((s, k) => s.recallAt[k]),
      precision: atEachK((s, k) => s.precisionAt[k]),
      ndcg: atEachK((s, k) => s.ndcgAt[k]),
    },
    mrr: mean(answerable.map((q) => q.score.reciprocalRank)),
    mrrByType: Object.fromEntries(
      [...types].map((type) => [
        type,
        mean(answerable.filter((q) => q.type === type).map((q) => q.score.reciprocalRank)),
      ]),
    ),
    kept: {
      evidenceRecall: mean(answerable.map((q) => q.keptRecall)),
      chunks: mean(answerable.map((q) => q.keptCount)),
      chars: mean(answerable.map((q) => q.keptChars)),
    },
    ...(info.budgetCharacters !== undefined
      ? { budget: budgetSummary(info.budgetCharacters, answerable) }
      : {}),
    topScores: {
      answerableMin: answerableTops.length > 0 ? Math.min(...answerableTops) : null,
      unanswerableMax: unanswerableTopScores.length > 0 ? Math.max(...unanswerableTopScores) : null,
    },
    questions: Object.fromEntries(
      answerable.map((q) => [
        q.id,
        {
          question: q.question,
          type: q.type,
          firstRank: q.score.firstRank,
          reciprocalRank: q.score.reciprocalRank,
        },
      ]),
    ),
  };
}
