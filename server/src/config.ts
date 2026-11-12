import { z } from 'zod';
import { SEARCH_STRATEGIES } from './rag/search/types.js';

// Validate environment variables once at startup so a missing or malformed
// value fails immediately with a clear message instead of crashing later.
const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  QDRANT_URL: z.string().min(1),
  // Optional for now; required once we reach the embeddings step.
  GOOGLE_API_KEY: z.string().optional(),
  // Optional answer-generation fallback, used when Gemini is overloaded. Free key: console.groq.com
  GROQ_API_KEY: z.string().optional(),
  // How chunks are found for a question. See src/rag/search.
  SEARCH_STRATEGY: z.enum(SEARCH_STRATEGIES).default('dense'),
  // Hybrid only: how much the exact-word list counts compared with the meaning list (1).
  HYBRID_SPARSE_WEIGHT: z.coerce.number().min(0).default(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
