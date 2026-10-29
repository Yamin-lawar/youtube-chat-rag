import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { fetchVideoMetadata, parseYoutubeId } from '../lib/youtube.js';

export const videosRouter = Router();

const addVideoSchema = z.object({ url: z.string().min(1) });
const videoIdParamSchema = z.object({ id: z.uuid() });

// The user's library, newest first.
videosRouter.get('/', async (req, res) => {
  const entries = await prisma.userVideo.findMany({
    where: { userId: req.userId },
    include: { video: true },
    orderBy: { addedAt: 'desc' },
  });

  res.json(entries.map((entry) => entry.video));
});

// Add a video to the user's library. If someone already added the same video,
// we reuse the stored entity and only create the link for this user.
videosRouter.post('/', async (req, res) => {
  const body = addVideoSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: 'A url is required' });
  }

  const youtubeId = parseYoutubeId(body.data.url);
  if (!youtubeId) {
    return res.status(400).json({ error: 'That does not look like a YouTube video URL' });
  }

  let video = await prisma.video.findUnique({ where: { youtubeId } });

  if (!video) {
    const metadata = await fetchVideoMetadata(youtubeId);
    if (!metadata) {
      return res
        .status(404)
        .json({ error: 'Video not found. It may be private, deleted or not embeddable.' });
    }

    // upsert, not create: two users may add the same new video at the same moment,
    // and the unique youtubeId must not turn the second request into an error.
    video = await prisma.video.upsert({
      where: { youtubeId },
      update: {},
      create: { youtubeId, ...metadata },
    });
  }

  await prisma.userVideo.upsert({
    where: { userId_videoId: { userId: req.userId, videoId: video.id } },
    update: {},
    create: { userId: req.userId, videoId: video.id },
  });

  res.status(201).json(video);
});

// Remove a video from the user's library. The shared video itself stays,
// because other users and conversations may still use it.
videosRouter.delete('/:id', async (req, res) => {
  const params = videoIdParamSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: 'Invalid video id' });
  }

  await prisma.userVideo.deleteMany({
    where: { userId: req.userId, videoId: params.data.id },
  });

  res.status(204).end();
});
