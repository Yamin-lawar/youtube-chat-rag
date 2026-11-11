import { CUTOFFS } from './metrics.js';
import { METRIC_LABELS, type MetricName, type RunRecord, type RunSettings } from './runRecord.js';

export interface MetricChange {
  metric: MetricName;
  k: number;
  before: number;
  after: number;
}

export interface RankChange {
  id: string;
  question: string;
  before: number | null;
  after: number | null;
}

export interface Comparison {
  before: RunRecord;
  after: RunRecord;
  metrics: MetricChange[];
  mrrByType: { type: string; before: number; after: number }[];
  /** Questions where the first correct chunk moved up (or was found when it was not). */
  improved: RankChange[];
  /** Questions where it moved down (or was lost). */
  worse: RankChange[];
  /** False when the two runs did not use the same questions, so the averages are not comparable. */
  sameQuestions: boolean;
}

// A missing rank (nothing correct returned) is worse than any real rank.
const rankValue = (rank: number | null) => rank ?? Number.POSITIVE_INFINITY;

export function compareRuns(before: RunRecord, after: RunRecord): Comparison {
  const metrics: MetricChange[] = [];
  for (const metric of Object.keys(METRIC_LABELS) as MetricName[]) {
    for (const k of CUTOFFS) {
      metrics.push({
        metric,
        k,
        before: before.metrics[metric][k] ?? 0,
        after: after.metrics[metric][k] ?? 0,
      });
    }
  }

  const improved: RankChange[] = [];
  const worse: RankChange[] = [];
  for (const [id, now] of Object.entries(after.questions)) {
    const earlier = before.questions[id];
    if (!earlier || earlier.firstRank === now.firstRank) continue;
    const change = { id, question: now.question, before: earlier.firstRank, after: now.firstRank };
    (rankValue(now.firstRank) < rankValue(earlier.firstRank) ? improved : worse).push(change);
  }

  const ids = (run: RunRecord) => Object.keys(run.questions).sort().join(',');

  return {
    before,
    after,
    metrics,
    mrrByType: Object.keys(after.mrrByType)
      .filter((type) => type in before.mrrByType)
      .map((type) => ({
        type,
        before: before.mrrByType[type] ?? 0,
        after: after.mrrByType[type] ?? 0,
      })),
    improved,
    worse,
    sameQuestions: ids(before) === ids(after),
  };
}

const points = (value: number) => Math.round(value * 100);
const signed = (n: number, digits = 0) => (n > 0 ? `+${n.toFixed(digits)}` : n.toFixed(digits));
const describe = (run: RunRecord) =>
  `"${run.label}" (${run.createdAt.slice(0, 10)}${run.commit ? `, commit ${run.commit}` : ''})`;
const rank = (value: number | null) => (value === null ? 'none' : String(value));

// A setting missing from an older file shows as "unknown" instead of "undefined".
const showSetting = (value: string | number | null | undefined) =>
  value === null ? 'none' : value === undefined ? 'unknown' : String(value);

function settingChanges(before: RunSettings, after: RunSettings): string[] {
  return (Object.keys(after) as (keyof RunSettings)[])
    .filter((key) => before[key] !== after[key])
    .map((key) => `${key} ${showSetting(before[key])} -> ${showSetting(after[key])}`);
}

/** The comparison as text for the terminal. Each cell shows the new value and the change in points. */
export function formatComparison(c: Comparison): string {
  const lines: string[] = [];
  const cell = (change: MetricChange) =>
    `${points(change.after)}% (${signed(points(change.after) - points(change.before))})`.padStart(
      11,
    );

  lines.push(`Compared with ${describe(c.before)}`);
  lines.push(`This run:     ${describe(c.after)}`);
  const changedSettings = settingChanges(c.before.settings, c.after.settings);
  lines.push(
    `Settings changed: ${changedSettings.length > 0 ? changedSettings.join(', ') : 'none'}`,
  );

  if (!c.sameQuestions) {
    lines.push(
      '\nWARNING: the two runs used different questions, so the averages below are not comparable.',
    );
  }

  lines.push('\n' + ''.padEnd(16) + CUTOFFS.map((k) => `top ${k}`.padStart(11)).join(''));
  for (const metric of Object.keys(METRIC_LABELS) as MetricName[]) {
    const row = c.metrics.filter((change) => change.metric === metric);
    lines.push(`  ${METRIC_LABELS[metric].padEnd(14)}${row.map(cell).join('')}`);
  }

  const mrrChange = c.after.mrr - c.before.mrr;
  lines.push(
    `\n  MRR ${c.before.mrr.toFixed(3)} -> ${c.after.mrr.toFixed(3)} (${signed(mrrChange, 3)})`,
  );
  for (const { type, before, after } of c.mrrByType) {
    lines.push(
      `    ${type.padEnd(14)}${before.toFixed(3)} -> ${after.toFixed(3)} (${signed(after - before, 3)})`,
    );
  }

  const section = (title: string, changes: RankChange[]) => {
    lines.push(`\n${title} (${changes.length}):`);
    for (const change of changes) {
      lines.push(
        `  ${change.id} rank ${rank(change.before)} -> ${rank(change.after)}  ${change.question}`,
      );
    }
  };
  section('Questions where the first correct chunk moved up', c.improved);
  section('Questions where it moved down', c.worse);

  lines.push(
    `\nOne question is worth ${(100 / c.after.answerableCount).toFixed(1)} points of hit rate. ` +
      'Changes of a few points are usually noise; look for the same direction across several metrics.',
  );
  return lines.join('\n');
}
