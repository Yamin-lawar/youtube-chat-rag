import { z } from 'zod';

// Validate environment variables once at startup so a missing or malformed
// value fails immediately with a clear message instead of crashing later.
const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  QDRANT_URL: z.string().min(1),
  // Optional for now; required once we reach the embeddings step.
  GOOGLE_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
