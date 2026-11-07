export type QuestionType =
  | 'fact' // one passage holds the answer
  | 'list' // the answer is spread over several passages
  | 'overview' // a broad question about the whole video
  | 'paraphrase' // worded very differently from the transcript
  | 'multi-video' // several videos are selected and only some are relevant
  | 'unanswerable'; // the videos do not contain the answer

/** A place in a video that contains (part of) the answer, given as a verbatim transcript quote. */
export interface EvidenceItem {
  youtubeId: string;
  quote: string;
}

export interface EvalQuestion {
  id: string;
  type: QuestionType;
  question: string;
  /** The videos selected for this question, like the videos picked for a chat. */
  youtubeIds: string[];
  /** Every passage that contains the answer. Empty for unanswerable questions. */
  evidence: EvidenceItem[];
}

/** A stretch of a video, in milliseconds. */
export interface TimeSpan {
  youtubeId: string;
  startMs: number;
  endMs: number;
}
