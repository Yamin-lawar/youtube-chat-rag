import type { ChatTurn } from './types.js';

// How much of the conversation the rewriter sees. A follow-up almost always refers to the
// last exchange or two, and a short prompt keeps this extra model call fast.
export const MAX_HISTORY_MESSAGES = 10;
const MAX_TURN_CHARS = 600;

export const REWRITE_SYSTEM_PROMPT = `You turn the last message of a chat into one standalone search question.

Rules:
- Use the chat history only to fill in what the last message leaves out, such as "it", "that", "they" or "and in China?".
- Keep the meaning and the language of the last message. Do not answer it. Do not add facts that are not in the history.
- If the last message already makes sense on its own, return it unchanged.
- Reply with the question only: one line, no quotes, no explanation.`;

/** Answers carry [1]-style citations and can be long. Neither helps to resolve a reference. */
function tidyTurn(content: string): string {
  const withoutCitations = content
    .replace(/\[\d{1,2}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutCitations.length <= MAX_TURN_CHARS
    ? withoutCitations
    : `${withoutCitations.slice(0, MAX_TURN_CHARS)}…`;
}

/** The user message for the rewriter: recent history, then the question to rewrite. */
export function buildRewritePrompt(question: string, history: ChatTurn[]): string {
  const lines = history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${tidyTurn(turn.content)}`);

  return `Chat history:\n${lines.join('\n')}\n\nLast message: ${question}\n\nStandalone question:`;
}
