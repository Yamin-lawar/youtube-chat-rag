const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

// Path prefixes where the video id is the next path segment,
// e.g. youtube.com/shorts/<id>.
const ID_PATH_PREFIXES = new Set(['shorts', 'embed', 'live', 'v']);

/**
 * Extracts the 11-character video id from the common YouTube URL formats.
 * Returns null if the input is not a recognizable YouTube video URL.
 */
export function parseYoutubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  let candidate: string | null = null;

  if (url.hostname === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    const [first, second] = url.pathname.split('/').filter(Boolean);
    if (first === 'watch') {
      candidate = url.searchParams.get('v');
    } else if (first && second && ID_PATH_PREFIXES.has(first)) {
      candidate = second;
    }
  }

  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

export interface VideoMetadata {
  title: string;
  channel: string | null;
  thumbnailUrl: string;
}

/**
 * Fetches title, channel and thumbnail from YouTube's public oEmbed endpoint.
 * It needs no API key. It also fails for private, deleted or non-embeddable
 * videos, which is the signal we use to reject bad URLs early.
 */
export async function fetchVideoMetadata(youtubeId: string): Promise<VideoMetadata | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    title: string;
    author_name?: string;
  };

  return {
    title: data.title,
    channel: data.author_name ?? null,
    // hqdefault exists for every video; maxresdefault does not.
    thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
  };
}
