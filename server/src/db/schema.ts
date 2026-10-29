import { integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Anonymous visitors get a row here the first time they open the app.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const videoStatus = pgEnum('video_status', ['processing', 'ready', 'failed']);

// A video is a shared entity: it is ingested and embedded once,
// then linked to any number of users.
export const videos = pgTable('videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  youtubeId: text('youtube_id').notNull().unique(),
  title: text('title').notNull(),
  channel: text('channel'),
  thumbnailUrl: text('thumbnail_url').notNull(),
  status: videoStatus('status').notNull().default('processing'),
  errorMessage: text('error_message'),
  chunkCount: integer('chunk_count'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// A user's library: which videos they have added.
export const userVideos = pgTable(
  'user_videos',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    addedAt: timestamp('added_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.videoId] })],
);

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New chat'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Which videos a conversation can search (max 5, enforced in the API).
export const conversationVideos = pgTable(
  'conversation_videos',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.videoId] })],
);

export const messageRole = pgEnum('message_role', ['user', 'assistant']);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRole('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
