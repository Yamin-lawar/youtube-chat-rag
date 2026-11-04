import type { Response } from 'express';

/** One Server-Sent Event: a named event with a JSON body, ended by a blank line. */
export function formatEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Turns the response into an event stream. The headers tell the browser and any proxy
 * to show each event as soon as it is written instead of buffering the whole answer.
 */
export function openEventStream(res: Response): (event: string, data: unknown) => void {
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops nginx from buffering the stream when the app is hosted behind it.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  return (event, data) => {
    // The viewer may have closed the tab. The answer is still finished and saved on the
    // server, so writes to a closed connection are skipped instead of failing.
    if (res.writableEnded || res.destroyed) return;
    res.write(formatEvent(event, data));
  };
}
