const TITLE_LENGTH = 60;

/** A chat title from the first question: one line, cut to a readable length. */
export function titleFromQuestion(question: string): string {
  const oneLine = question.replace(/\s+/g, ' ').trim();
  return oneLine.length <= TITLE_LENGTH ? oneLine : `${oneLine.slice(0, TITLE_LENGTH - 1)}…`;
}
