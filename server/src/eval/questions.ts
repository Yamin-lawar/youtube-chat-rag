import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { EvalQuestion } from './types.js';

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['fact', 'list', 'overview', 'paraphrase', 'multi-video', 'unanswerable']),
  question: z.string().min(1),
  youtubeIds: z.array(z.string().length(11)).min(1),
  evidence: z.array(z.object({ youtubeId: z.string().length(11), quote: z.string().min(8) })),
});

const fileSchema = z.object({ questions: z.array(questionSchema).min(1) });

/** Reads and validates the question file, so a typo fails here and not halfway through a run. */
export async function loadQuestions(path: string): Promise<EvalQuestion[]> {
  const { questions } = fileSchema.parse(JSON.parse(await readFile(path, 'utf8')));

  const ids = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) throw new Error(`Duplicate question id ${q.id}`);
    ids.add(q.id);

    if (q.type === 'unanswerable' && q.evidence.length > 0) {
      throw new Error(`${q.id} is unanswerable, so it must have no evidence`);
    }
    if (q.type !== 'unanswerable' && q.evidence.length === 0) {
      throw new Error(`${q.id} needs at least one evidence quote`);
    }
    for (const item of q.evidence) {
      if (!q.youtubeIds.includes(item.youtubeId)) {
        throw new Error(`${q.id}: evidence is from ${item.youtubeId}, which is not selected`);
      }
    }
  }
  return questions;
}

/**
 * Picks some of the questions, for scoring only a part of the set (for example the questions
 * added after a setting was chosen, to check that choice on questions it never saw).
 *
 * `spec` is a comma-separated list of ids and ranges in file order: "q03", "q42-q86",
 * "q01,q05-q07". An unknown id or a range written backwards is an error, so a typo does not
 * quietly score fewer questions than intended.
 */
export function selectQuestions(questions: EvalQuestion[], spec: string): EvalQuestion[] {
  const positionOf = (id: string): number => {
    const at = questions.findIndex((q) => q.id === id);
    if (at === -1) throw new Error(`No question with id "${id}"`);
    return at;
  };

  const chosen = new Set<number>();
  for (const part of spec.split(',').map((item) => item.trim())) {
    const [from, to = from] = part.split('-').map((id) => id.trim());
    if (!from || !to)
      throw new Error(`Cannot read "${part}". Use ids like q03 or ranges like q42-q86`);

    const [start, end] = [positionOf(from), positionOf(to)];
    if (start > end) throw new Error(`The range "${part}" runs backwards`);
    for (let i = start; i <= end; i++) chosen.add(i);
  }
  return questions.filter((_, i) => chosen.has(i));
}
