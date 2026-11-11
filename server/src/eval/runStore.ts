import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { RUN_RECORD_VERSION, type RunRecord } from './runRecord.js';

export async function writeRun(record: RunRecord, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(record, null, 2) + '\n');
}

/** Saves a run as `<dir>/<date-time>-<label>.json` and returns the path. */
export async function saveRun(record: RunRecord, dir: string): Promise<string> {
  const stamp = record.createdAt.slice(0, 19).replace(/[:T]/g, '-');
  const label = record.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const path = join(dir, `${stamp}-${label}.json`);
  await writeRun(record, path);
  return path;
}

export async function loadRun(path: string): Promise<RunRecord> {
  const record = JSON.parse(await readFile(path, 'utf8')) as RunRecord;
  // A file from an older shape would give wrong numbers silently, so fail loudly instead.
  if (record.version !== RUN_RECORD_VERSION) {
    throw new Error(`${path} has format version ${record.version}, expected ${RUN_RECORD_VERSION}`);
  }
  return record;
}

/** The short git commit the run was made on, or null outside a git checkout. */
export function currentCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
