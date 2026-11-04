import { errorFromResponse } from './http';
import { readEvents } from './sse';
import type { Source } from './types';

export type ChatEvent =
  | { type: 'start' }
  | { type: 'sources'; sources: Source[]; model: string }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Sends a question and yields the answer as it is written. EventSource cannot send a POST
 * body, so this uses fetch and reads the event stream by hand.
 */
export async function* askQuestion(
  conversationId: string,
  content: string,
): AsyncGenerator<ChatEvent> {
  const response = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) throw new Error('The server sent no answer');

  for await (const { event, data } of readEvents(response.body)) {
    const payload = data as Record<string, unknown>;
    switch (event) {
      case 'start':
        yield { type: 'start' };
        break;
      case 'sources':
        yield {
          type: 'sources',
          sources: payload.sources as Source[],
          model: String(payload.model),
        };
        break;
      case 'token':
        yield { type: 'token', text: String(payload.text) };
        break;
      case 'done':
        yield { type: 'done' };
        break;
      case 'error':
        yield { type: 'error', message: String(payload.message) };
        break;
    }
  }
}
