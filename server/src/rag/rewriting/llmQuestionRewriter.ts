import type { MessageContent } from '@langchain/core/messages';
import { contentToText } from '../generation/chatModelGenerator.js';
import { REWRITE_SYSTEM_PROMPT, buildRewritePrompt } from './prompt.js';
import type { ChatTurn, QuestionRewriter } from './types.js';

/** The one thing we need from a chat model. Any LangChain chat model fits. */
export interface TextModel {
  invoke(
    messages: Array<[string, string]>,
    options?: { signal?: AbortSignal },
  ): Promise<{ content: MessageContent }>;
}

export interface NamedModel {
  name: string;
  model: TextModel;
}

// A rewrite is one short question. Anything much longer means the model started answering
// or explaining, so it is safer to search with the original question instead.
const MAX_REWRITE_CHARS = 400;

// A rewrite is a tiny task and it sits in front of every follow-up. A provider that has not
// answered in this time is treated as down, so the next one is tried. (In our tests the Gemini
// free tier sometimes took minutes for a call that Groq answered in one second.)
const DEFAULT_TIMEOUT_MS = 6000;

/**
 * Cleans a model reply into a single question: first non-empty line, without quotes or a
 * "Standalone question:" label. Returns '' when the reply cannot be trusted.
 */
export function cleanRewrite(raw: string): string {
  const firstLine = raw.split('\n').find((line) => line.trim() !== '') ?? '';
  const cleaned = firstLine
    .replace(/^\s*(standalone question|question)\s*:\s*/i, '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
  return cleaned.length > MAX_REWRITE_CHARS ? '' : cleaned;
}

/**
 * Rewrites a follow-up into a standalone question with an LLM. Models are tried in order,
 * and if none of them works the original question is used: a failed rewrite should make
 * search a little worse, never make the chat fail.
 */
export class LlmQuestionRewriter implements QuestionRewriter {
  constructor(
    private readonly models: NamedModel[],
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async rewrite(question: string, history: ChatTurn[]): Promise<string> {
    // Nothing to resolve in the first message, so we skip the extra model call.
    if (history.length === 0) return question;

    const prompt = buildRewritePrompt(question, history);

    for (const { name, model } of this.models) {
      try {
        const reply = await model.invoke(
          [
            ['system', REWRITE_SYSTEM_PROMPT],
            ['human', prompt],
          ],
          { signal: AbortSignal.timeout(this.timeoutMs) },
        );
        const rewritten = cleanRewrite(contentToText(reply.content));
        if (rewritten) return rewritten;
        console.warn(`Rewriting with ${name} gave an unusable reply`);
      } catch (error) {
        console.warn(
          `Rewriting with ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return question;
  }
}
