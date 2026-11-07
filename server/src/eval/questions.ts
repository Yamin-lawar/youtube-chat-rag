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
