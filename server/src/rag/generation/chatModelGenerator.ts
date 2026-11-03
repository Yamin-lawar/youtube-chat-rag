import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { SYSTEM_PROMPT, buildUserPrompt, normalizeCitations } from './prompt.js';
import type { Answer, Generator } from './types.js';

export const NOT_FOUND_ANSWER = 'I could not find anything about that in the selected videos.';

/**
 * Works with any LangChain chat model (Gemini, Groq, ...). The prompt and the sources are the
 * same for every provider, so only the model passed in changes.
 */
export class ChatModelGenerator implements Generator {
  constructor(
    readonly name: string,
    private readonly model: BaseChatModel,
  ) {}

  async generate(question: string, chunks: ScoredChunk[]): Promise<Answer> {
    // With nothing retrieved there is nothing to ground an answer on, so we skip the model.
    if (chunks.length === 0) return { text: NOT_FOUND_ANSWER, sources: [], model: this.name };

    const response = await this.model.invoke([
      ['system', SYSTEM_PROMPT],
      ['human', buildUserPrompt(question, chunks)],
    ]);

    return {
      text: normalizeCitations(
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content),
      ),
      sources: chunks.map((chunk, i) => ({
        number: i + 1,
        youtubeId: chunk.youtubeId,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
      })),
      model: this.name,
    };
  }
}
