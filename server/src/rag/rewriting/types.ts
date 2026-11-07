/** One earlier message of the conversation, as the rewriter needs it. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * The query-rewriting step: a question that may depend on the conversation ("and in China?")
 * -> a question that makes sense on its own, ready to be embedded and searched.
 */
export interface QuestionRewriter {
  rewrite(question: string, history: ChatTurn[]): Promise<string>;
}
