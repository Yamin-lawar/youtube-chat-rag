/** 83000 -> "1:23", 3725000 -> "1:02:05". */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** A link that opens the video at the given moment. */
export function youtubeLink(youtubeId: string, startMs: number): string {
  return `https://www.youtube.com/watch?v=${youtubeId}&t=${Math.floor(startMs / 1000)}s`;
}

export function watchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}
