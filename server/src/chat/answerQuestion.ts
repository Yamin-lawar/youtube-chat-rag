import type { Generator, Source } from '../rag/generation/types.js';
import type { ScoredChunk } from '../rag/vectorstore/qdrantChunkStore.js';

/** The fields of the assistant message that change while an answer is written. */
export interface MessagePatch {
  content?: string;
  status?: 'streaming' | 'complete' | 'failed';
  model?: string;
  sources?: Source[];
}

export interface AnswerDependencies {
  retrieve(question: string, youtubeIds: string[]): Promise<ScoredChunk[]>;
  generator: Generator;
  /** Writes to the assistant message row. Passed in so this logic can be tested without a database. */
  saveMessage(patch: MessagePatch): Promise<void>;
}

export type Emit = (event: string, data: unknown) => void;

// Saving every token would mean one database write per word. Saving every second is enough
// to leave a useful partial answer if the server stops mid-stream.
const SAVE_INTERVAL_MS = 1000;

export const GENERIC_ERROR = 'Could not generate an answer. Please try again.';

/**
 * Answers one question and reports progress as events:
 *   sources -> token, token, ... -> done        (or `error` if anything fails)
 * The assistant message is saved as it grows, and ends as `complete` or `failed`.
 * It never throws, because by the time it runs the HTTP response is already open.
 */
export async function answerQuestion(
  question: string,
  youtubeIds: string[],
  { retrieve, generator, saveMessage }: AnswerDependencies,
  emit: Emit,
): Promise<void> {
  let text = '';

  try {
    // RAG block 8 (history-aware rewriting) will turn a follow-up such as "and in China?"
    // into a standalone question right here, before retrieval.
    const chunks = await retrieve(question, youtubeIds);
    const answer = await generator.stream(question, chunks);

    await saveMessage({ model: answer.model, sources: answer.sources });
    emit('sources', { sources: answer.sources, model: answer.model });

    let lastSavedAt = Date.now();
    for await (const token of answer.tokens) {
      text += token;
      emit('token', { text: token });

      if (Date.now() - lastSavedAt >= SAVE_INTERVAL_MS) {
        await saveMessage({ content: text });
        lastSavedAt = Date.now();
      }
    }

    await saveMessage({ content: text, status: 'complete' });
    emit('done', {});
  } catch (error) {
    console.error('Answering failed:', error);
    // Keep whatever was written so far, so the user can still read the partial answer.
    await saveMessage({ content: text, status: 'failed' }).catch((saveError: unknown) => {
      console.error('Could not mark the message as failed:', saveError);
    });
    emit('error', { message: GENERIC_ERROR });
  }
}
