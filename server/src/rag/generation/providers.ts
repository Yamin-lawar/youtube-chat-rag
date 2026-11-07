import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatModelGenerator } from './chatModelGenerator.js';
import { FallbackGenerator } from './fallbackGenerator.js';
import { LlmQuestionRewriter } from '../rewriting/llmQuestionRewriter.js';
import type { QuestionRewriter } from '../rewriting/types.js';
import type { Generator } from './types.js';

export const GEMINI_MODEL = 'gemini-3.8-flash';
export const GROQ_MODEL = 'openai/gpt-oss-120b';

// A low temperature keeps the answer close to the excerpts instead of getting creative.
const ANSWER_TEMPERATURE = 0.2;
// Rewriting should be repeatable: the same follow-up should always give the same question.
const REWRITE_TEMPERATURE = 0;

export interface GeneratorKeys {
  googleApiKey?: string | undefined;
  groqApiKey?: string | undefined;
}

/** The chat models we can use, in the order they are tried. Only providers with a key are included. */
function buildModels(
  { googleApiKey, groqApiKey }: GeneratorKeys,
  temperature: number,
): Array<{ name: string; model: BaseChatModel }> {
  const models: Array<{ name: string; model: BaseChatModel }> = [];

  if (googleApiKey) {
    models.push({
      name: `gemini:${GEMINI_MODEL}`,
      model: new ChatGoogleGenerativeAI({
        apiKey: googleApiKey,
        model: GEMINI_MODEL,
        temperature,
        // Fail fast so the fallback can take over instead of waiting through long retries.
        maxRetries: 1,
      }),
    });
  }

  if (groqApiKey) {
    models.push({
      name: `groq:${GROQ_MODEL}`,
      model: new ChatGroq({ apiKey: groqApiKey, model: GROQ_MODEL, temperature }),
    });
  }

  if (models.length === 0) {
    throw new Error('Set GOOGLE_API_KEY or GROQ_API_KEY in .env to generate answers.');
  }
  return models;
}

/**
 * Builds the generator from whichever API keys are set. Gemini is tried first and Groq
 * takes over when Gemini fails, for example on the free tier's "high demand" 503 errors.
 */
export function createGenerator(keys: GeneratorKeys): Generator {
  const generators = buildModels(keys, ANSWER_TEMPERATURE).map(
    ({ name, model }) => new ChatModelGenerator(name, model),
  );
  return new FallbackGenerator(generators);
}

/**
 * The query rewriter. Groq goes first here, the opposite of the generator: a rewrite is one
 * short sentence, and in our tests Groq answered it in about a second while Gemini took
 * between 19 and 193 seconds. The rewriter also gives up on a model after a few seconds.
 */
export function createRewriter(keys: GeneratorKeys): QuestionRewriter {
  return new LlmQuestionRewriter(buildModels(keys, REWRITE_TEMPERATURE).reverse());
}
