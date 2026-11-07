// RAG block 8: see how a follow-up question is rewritten into a standalone one.
//
//   npx tsx --env-file=../.env scripts/rewrite.ts
//       runs a few built-in examples
//
//   npx tsx --env-file=../.env scripts/rewrite.ts "and in China?" "u:How much power do data centers need?" "a:About 1 GW each."
//       your own question, then the earlier messages (oldest first), each starting with
//       "u:" for a user message or "a:" for an assistant message
import { config } from '../src/config.js';
import { createRewriter } from '../src/rag/generation/providers.js';
import { buildRewritePrompt } from '../src/rag/rewriting/prompt.js';
import type { ChatTurn } from '../src/rag/rewriting/types.js';

const rewriter = createRewriter({
  googleApiKey: config.GOOGLE_API_KEY,
  groqApiKey: config.GROQ_API_KEY,
});

interface Case {
  question: string;
  history: ChatTurn[];
}

const examples: Case[] = [
  {
    question: 'and in China?',
    history: [
      { role: 'user', content: 'How much power do AI data centers need?' },
      {
        role: 'assistant',
        content: 'A large AI data center can need about 1 GW, as much as a city [1].',
      },
    ],
  },
  {
    question: 'Why is that a problem?',
    history: [
      { role: 'user', content: 'What does the speaker say about the power grid?' },
      {
        role: 'assistant',
        content: 'The grid cannot grow fast enough to supply new data centers [2].',
      },
    ],
  },
  {
    // Already clear on its own: it should come back unchanged.
    question: 'Who is the guest in this interview?',
    history: [
      { role: 'user', content: 'How much power do AI data centers need?' },
      { role: 'assistant', content: 'About 1 GW each [1].' },
    ],
  },
  {
    // A topic change: nothing from the history should leak into the question.
    question: 'What does he think about cooling?',
    history: [
      { role: 'user', content: 'Summarize the video' },
      { role: 'assistant', content: 'Elon Musk talks about AI, power and chips [1][3].' },
    ],
  },
];

function parseHistory(parts: string[]): ChatTurn[] {
  return parts.map((part) => {
    if (part.startsWith('u:')) return { role: 'user', content: part.slice(2) };
    if (part.startsWith('a:')) return { role: 'assistant', content: part.slice(2) };
    throw new Error(`History messages must start with "u:" or "a:", got: ${part}`);
  });
}

const [question, ...historyParts] = process.argv.slice(2);
const cases: Case[] = question ? [{ question, history: parseHistory(historyParts) }] : examples;

for (const { question: q, history } of cases) {
  console.log('='.repeat(70));
  console.log('PROMPT SENT TO THE REWRITER');
  console.log(buildRewritePrompt(q, history));

  const startedAt = Date.now();
  const rewritten = await rewriter.rewrite(q, history);

  console.log(`\nORIGINAL : ${q}`);
  console.log(`REWRITTEN: ${rewritten}  (${Date.now() - startedAt} ms)`);
  console.log(rewritten === q ? '=> unchanged' : '=> changed');
}
