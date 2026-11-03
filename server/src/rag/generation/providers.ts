import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ChatModelGenerator } from './chatModelGenerator.js';
import { FallbackGenerator } from './fallbackGenerator.js';
import type { Generator } from './types.js';

export const GEMINI_MODEL = 'gemini-3.8-flash';
export const GROQ_MODEL = 'openai/gpt-oss-120b';

// A low temperature keeps the answer close to the excerpts instead of getting creative.
const TEMPERATURE = 0.2;

export interface GeneratorKeys {
  googleApiKey?: string | undefined;
  groqApiKey?: string | undefined;
}

/**
 * Builds the generator from whichever API keys are set. Gemini is tried first and Groq
 * takes over when Gemini fails, for example on the free tier's "high demand" 503 errors.
 */
export function createGenerator({ googleApiKey, groqApiKey }: GeneratorKeys): Generator {
  const generators: Generator[] = [];

  if (googleApiKey) {
    const model = new ChatGoogleGenerativeAI({
      apiKey: googleApiKey,
      model: GEMINI_MODEL,
      temperature: TEMPERATURE,
      // Fail fast so the fallback can take over instead of waiting through long retries.
      maxRetries: 1,
    });
    generators.push(new ChatModelGenerator(`gemini:${GEMINI_MODEL}`, model));
  }

  if (groqApiKey) {
    const model = new ChatGroq({ apiKey: groqApiKey, model: GROQ_MODEL, temperature: TEMPERATURE });
    generators.push(new ChatModelGenerator(`groq:${GROQ_MODEL}`, model));
  }

  if (generators.length === 0) {
    throw new Error('Set GOOGLE_API_KEY or GROQ_API_KEY in .env to generate answers.');
  }
  return new FallbackGenerator(generators);
}
