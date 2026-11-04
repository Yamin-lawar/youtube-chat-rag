import { Router } from 'express';
import { z } from 'zod';
import { answerQuestion } from '../chat/answerQuestion.js';
import { titleFromQuestion } from '../chat/title.js';
import { prisma } from '../db/client.js';
import { openEventStream } from '../lib/sse.js';
import { retrieveChunks } from '../rag/retrieval/retriever.js';
import { getRagServices } from '../rag/services.js';

export const conversationsRouter = Router();

const MAX_VIDEOS_PER_CONVERSATION = 5;
const MAX_QUESTION_LENGTH = 2000;
const DEFAULT_TITLE = 'New chat';

const createSchema = z.object({
  videoIds: z
    .array(z.uuid())
    .min(1, 'Pick at least one video')
    .max(MAX_VIDEOS_PER_CONVERSATION, `Pick at most ${MAX_VIDEOS_PER_CONVERSATION} videos`),
});
const idParamSchema = z.object({ id: z.uuid() });
const messageSchema = z.object({ content: z.string().trim().min(1).max(MAX_QUESTION_LENGTH) });

const withVideos = {
  videos: { include: { video: true } },
} as const;

type ConversationWithVideos = Awaited<ReturnType<typeof findConversation>>;

function findConversation(id: string, userId: string) {
  // Filtering by userId as well as id is what keeps one visitor out of another's chats.
  return prisma.conversation.findFirst({ where: { id, userId }, include: withVideos });
}

function toConversationJson(conversation: NonNullable<ConversationWithVideos>) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    videos: conversation.videos.map(({ video }) => ({
      id: video.id,
      youtubeId: video.youtubeId,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
    })),
  };
}

conversationsRouter.get('/', async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.userId },
    include: withVideos,
    orderBy: { updatedAt: 'desc' },
  });
  res.json(conversations.map(toConversationJson));
});

conversationsRouter.post('/', async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: body.error.issues[0]?.message ?? 'Invalid request' });
  }

  const videoIds = [...new Set(body.data.videoIds)];

  // Only videos in the caller's own library can be chatted with.
  const library = await prisma.userVideo.findMany({
    where: { userId: req.userId, videoId: { in: videoIds } },
    include: { video: true },
  });
  if (library.length !== videoIds.length) {
    return res.status(404).json({ error: 'One of the videos is not in your library' });
  }
  if (library.some(({ video }) => video.status !== 'ready')) {
    return res.status(409).json({ error: 'Wait until all selected videos are ready' });
  }

  const created = await prisma.conversation.create({
    data: {
      userId: req.userId,
      videos: { create: videoIds.map((videoId) => ({ videoId })) },
    },
    include: withVideos,
  });
  res.status(201).json(toConversationJson(created));
});

conversationsRouter.get('/:id', async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: 'Invalid conversation id' });

  const conversation = await findConversation(params.data.id, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      status: true,
      model: true,
      sources: true,
      createdAt: true,
    },
  });
  res.json({ ...toConversationJson(conversation), messages });
});

conversationsRouter.delete('/:id', async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: 'Invalid conversation id' });

  await prisma.conversation.deleteMany({ where: { id: params.data.id, userId: req.userId } });
  res.status(204).end();
});

// Ask a question. The answer comes back as a stream of Server-Sent Events:
//   start -> sources -> token ... -> done      (or `error`)
conversationsRouter.post('/:id/messages', async (req, res) => {
  const params = idParamSchema.safeParse(req.params);
  const body = messageSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({ error: 'A question of 1 to 2000 characters is required' });
  }

  const conversation = await findConversation(params.data.id, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const question = body.data.content;
  const youtubeIds = conversation.videos.map(({ video }) => video.youtubeId);

  // Both rows are written before streaming starts, so a dropped connection still leaves
  // the question and a (possibly partial) answer in the history.
  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content: question },
    }),
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: '',
        status: 'streaming',
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        // Naming the chat after its first question; touching updatedAt sorts it to the top.
        title: conversation.title === DEFAULT_TITLE ? titleFromQuestion(question) : undefined,
      },
    }),
  ]);

  const emit = openEventStream(res);
  emit('start', { userMessageId: userMessage.id, assistantMessageId: assistantMessage.id });

  const { embedder, store, generator } = getRagServices();
  await answerQuestion(
    question,
    youtubeIds,
    {
      retrieve: (q, ids) => retrieveChunks(q, { embedder, store }, { youtubeIds: ids }),
      generator,
      saveMessage: async ({ sources, ...patch }) => {
        await prisma.message.update({
          where: { id: assistantMessage.id },
          // Sources are plain numbers and text, so a JSON round trip gives Prisma the JSON type it expects.
          data: { ...patch, ...(sources && { sources: JSON.parse(JSON.stringify(sources)) }) },
        });
      },
    },
    emit,
  );
  res.end();
});
