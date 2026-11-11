// Compare two saved eval runs.
//
//   npm run eval:compare -- eval/baseline.json eval/runs/2026-11-12-10-30-00-hybrid.json
//
// The first file is the "before", the second the "after". `npm run eval` already compares each
// new run with eval/baseline.json, so use this to compare any two runs you saved.
import { compareRuns, formatComparison } from '../src/eval/compare.js';
import { loadRun } from '../src/eval/runStore.js';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('Usage: npm run eval:compare -- <before.json> <after.json>');
  process.exit(1);
}

console.log(formatComparison(compareRuns(await loadRun(beforePath), await loadRun(afterPath))));
