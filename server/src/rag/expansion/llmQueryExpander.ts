import { createHash } from 'node:crypto';
import { contentToText } from '../generation/chatModelGenerator.js';
import type { NamedModel } from '../rewriting/llmQuestionRewriter.js';
import type { ExpansionPrompt } from './names.js';
import { EXPANSION_SYSTEM_PROMPTS, buildExpansionPrompt } from './prompts.js';
import type { QueryExpander } from './types.js';

// A passage is two or three sentences. Much longer means the model started explaining.
const MAX_PASSAGE_CHARS = 1000;
const MAX_VARIANTS = 3;

// Expansion sits in front of every question, so a model that has not answered in this time is
// treated as down and the next one is tried.
const DEFAULT_TIMEOUT_MS = 8000;

/** One passage: the reply with its whitespace tidied. Empty when the reply cannot be trusted. */
export function cleanPassage(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > MAX_PASSAGE_CHARS ? '' : text;
}

/**
 * Up to three queries from a reply with one per line. Numbering, bullets, a "Query 2:" label and
 * quotes are removed, and repeats (or a copy of the question) are dropped.
 */
export function cleanVariants(raw: string, question: string): string[] {
  const seen = new Set([question.trim().toLowerCase()]);
  const variants: string[] = [];

  for (const line of raw.split('\n')) {
    const cleaned = line
      .replace(/^\s*(?:[-*•]|\d+[.)]|query\s*\d+\s*[:.-])\s*/i, '')
      .trim()
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .trim();
    if (!cleaned || cleaned.length > MAX_PASSAGE_CHARS || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    variants.push(cleaned);
  }
  return variants.slice(0, MAX_VARIANTS);
}

export interface ExpanderOptions {
  timeoutMs?: number;
}

/**
 * Expands a question with an LLM. Models are tried in order. It throws when none of them gives
 * a usable reply, and the search decides what to do then (the app searches with the original
 * question; the eval stops, so it never scores a failed expansion as a result).
 */
export class LlmQueryExpander implements QueryExpander {
  readonly id: string;
  private readonly systemPrompt: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly prompt: ExpansionPrompt,
    private readonly models: NamedModel[],
    { timeoutMs = DEFAULT_TIMEOUT_MS }: ExpanderOptions = {},
  ) {
    this.systemPrompt = EXPANSION_SYSTEM_PROMPTS[prompt];
    this.timeoutMs = timeoutMs;
    // The prompt text is part of the id, so editing the prompt starts a fresh cache.
    const digest = createHash('sha256').update(this.systemPrompt).digest('hex').slice(0, 8);
    this.id = `${prompt}:${models.map((m) => m.name).join('>')}:${digest}`;
  }

  async expand(question: string): Promise<string[]> {
    const errors: string[] = [];

    for (const { name, model } of this.models) {
      try {
        const reply = await model.invoke(
          [
            ['system', this.systemPrompt],
            ['human', buildExpansionPrompt(question)],
          ],
          { signal: AbortSignal.timeout(this.timeoutMs) },
        );
        const text = contentToText(reply.content);
        const texts = this.prompt === 'hyde' ? [cleanPassage(text)] : cleanVariants(text, question);
        const usable = texts.filter(Boolean);
        if (usable.length > 0) return usable;
        errors.push(`${name}: unusable reply`);
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Query expansion failed.\n${errors.join('\n')}`);
  }
}
