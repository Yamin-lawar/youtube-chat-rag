/**
 * The ways a question can be expanded before searching. Chosen with QUERY_EXPANSION in .env (or
 * `--expansion` in the eval). Kept free of heavy imports so the config can read it at startup.
 *
 * - `prompt` says what the model is asked to write.
 * - `keepOriginal` says whether the user's own question is searched as well. When it is, the
 *   lists of results are merged with rank fusion. When it is not, only the model's text is used.
 */
export const EXPANSION_MODES = {
  hyde: { prompt: 'hyde', keepOriginal: false },
  'hyde+q': { prompt: 'hyde', keepOriginal: true },
  multi: { prompt: 'multi', keepOriginal: true },
} as const;

export const EXPANSION_NAMES = ['none', 'hyde', 'hyde+q', 'multi'] as const;
export type ExpansionName = (typeof EXPANSION_NAMES)[number];
export type ExpansionPrompt = (typeof EXPANSION_MODES)[keyof typeof EXPANSION_MODES]['prompt'];
