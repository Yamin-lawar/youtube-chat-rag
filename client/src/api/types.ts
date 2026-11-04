// These mirror what the Express API returns.

export type VideoStatus = 'processing' | 'ready' | 'failed';

export interface Video {
  id: string;
  youtubeId: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string;
  status: VideoStatus;
  errorMessage: string | null;
  chunkCount: number | null;
  createdAt: string;
}

/** The part of a video a conversation needs to show it. */
export interface ConversationVideo {
  id: string;
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  videos: ConversationVideo[];
}

/** A passage an answer was based on. `number` is the [n] used in the answer text. */
export interface Source {
  number: number;
  youtubeId: string;
  startMs: number;
  endMs: number;
  snippet: string;
}

export type MessageStatus = 'streaming' | 'complete' | 'failed';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  model: string | null;
  sources: Source[] | null;
  createdAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}
