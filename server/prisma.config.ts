import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 does not read .env files, and ours lives in the repo root. Load it here so
// `npm run db:migrate` works from a fresh clone. Where no file exists (CI, a host),
// DATABASE_URL has to come from the real environment instead.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
