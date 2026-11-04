export interface ServerEvent {
  event: string;
  data: unknown;
}

/** Parses one event block ("event: x\ndata: {...}"). Returns null for comments or empty blocks. */
export function parseEventBlock(block: string): ServerEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;

  return { event, data: JSON.parse(dataLines.join('\n')) as unknown };
}

/**
 * Splits received text into complete events and the unfinished rest. A network chunk can
 * end in the middle of an event, so the rest is kept and joined with the next chunk.
 */
export function splitEvents(buffer: string): { events: ServerEvent[]; rest: string } {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks.flatMap((block) => {
    const parsed = parseEventBlock(block);
    return parsed ? [parsed] : [];
  });
  return { events, rest };
}

/** Reads a Server-Sent Events response body and yields each event as it arrives. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  // `stream: true` keeps a character that is split across two network chunks intact.
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { events, rest } = splitEvents(buffer);
      buffer = rest;
      yield* events;
    }
  } finally {
    reader.releaseLock();
  }
}
