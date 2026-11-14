/**
 * The query-expansion step: a question -> extra texts to search with. Unlike the follow-up
 * rewriter (which makes a chat question stand on its own), this one tries to make the search
 * itself find more: a passage written in the transcript's style, or the same question reworded.
 */
export interface QueryExpander {
  /**
   * Identifies the prompt and the model, so a cache never returns text written by another
   * prompt or model.
   */
  readonly id: string;
  /** One or more texts to search with. Throws when nothing usable could be written. */
  expand(question: string): Promise<string[]>;
}

/** An expander and how its texts are used. */
export interface Expansion {
  expander: QueryExpander;
  /** Search the user's own question too, and merge the results. */
  keepOriginal: boolean;
}
