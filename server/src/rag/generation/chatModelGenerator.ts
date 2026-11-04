import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { MessageContent } from '@langchain/core/messages';
import type { ScoredChunk } from '../vectorstore/qdrantChunkStore.js';
import { normalizeCitationStream } from './citations.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import type { Answer, AnswerStream, Generator, Source } from './types.js';

const SNIPPET_LENGTH = 220;

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

  async stream(question: string, chunks: ScoredChunk[]): Promise<AnswerStream> {
    const sources = toSources(chunks);

    // With nothing retrieved there is nothing to ground an answer on, so we skip the model.
    if (chunks.length === 0) {
      return { sources, model: this.name, tokens: oneToken(NOT_FOUND_ANSWER) };
    }

    const modelStream = await this.model.stream([
      ['system', SYSTEM_PROMPT],
      ['human', buildUserPrompt(question, chunks)],
    ]);

    // Wait for the first token here. Errors such as a 503 usually show up at this point,
    // and throwing now lets the fallback switch models before the user has seen any text.
    const tokens = textTokens(modelStream);
    const first = await tokens.next();
    if (first.done) throw new Error(`${this.name} returned an empty answer`);

    return {
      sources,
      model: this.name,
      tokens: normalizeCitationStream(prepend(first.value, tokens)),
    };
  }

  async generate(question: string, chunks: ScoredChunk[]): Promise<Answer> {
    const { sources, model, tokens } = await this.stream(question, chunks);

    let text = '';
    for await (const token of tokens) text += token;
    return { text, sources, model };
  }
}

function toSources(chunks: ScoredChunk[]): Source[] {
  return chunks.map((chunk, i) => ({
    number: i + 1,
    youtubeId: chunk.youtubeId,
    startMs: chunk.startMs,
    endMs: chunk.endMs,
    snippet: chunk.text.slice(0, SNIPPET_LENGTH),
  }));
}

// Models return text either as a string or as a list of parts, depending on the provider.
function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content.map((part) => (part.type === 'text' && 'text' in part ? part.text : '')).join('');
}

async function* textTokens(
  modelStream: AsyncIterable<{ content: MessageContent }>,
): AsyncGenerator<string> {
  for await (const piece of modelStream) {
    const text = contentToText(piece.content);
    if (text) yield text;
  }
}

async function* prepend(first: string, rest: AsyncIterable<string>): AsyncGenerator<string> {
  yield first;
  yield* rest;
}

async function* oneToken(text: string): AsyncGenerator<string> {
  yield text;
}
