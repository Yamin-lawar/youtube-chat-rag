import type { ExpansionPrompt } from './names.js';

// "HyDE" (hypothetical document embedding): a question and the passage that answers it are
// worded differently, but an invented answer is worded like the passage, so it lands closer
// to it in the embedding space. The invented facts may be wrong. That is fine, the text is only
// used to find real passages and is never shown to anyone.
const HYDE_SYSTEM_PROMPT = `You help a search engine that looks through YouTube video transcripts. Given a question, write a short passage that a speaker in a video might say when answering it.

Rules:
- Two or three sentences of natural spoken language, the way auto-generated captions read. No headings, no bullet points.
- Use the specific names, terms and numbers a speaker would likely say. If you do not know the facts, make a plausible guess. The passage is only used to find similar text and is never shown to anyone.
- Do not mention the question and do not say you do not know.
- Reply with the passage only.`;

const MULTI_SYSTEM_PROMPT = `You help a search engine that looks through YouTube video transcripts. Given a question, write three different search queries that would find the passage that answers it.

Rules:
- Query 1: the question reworded with different words, keeping its meaning.
- Query 2: only the key terms, names and numbers a speaker would say, with no question words.
- Query 3: a short statement, the way a speaker might say the answer.
- Do not answer the question and do not add facts. Keep the language of the question.
- Reply with the three queries only, one per line, with no numbers and no quotes.`;

export const EXPANSION_SYSTEM_PROMPTS: Record<ExpansionPrompt, string> = {
  hyde: HYDE_SYSTEM_PROMPT,
  multi: MULTI_SYSTEM_PROMPT,
};

export function buildExpansionPrompt(question: string): string {
  return `Question: ${question}`;
}
