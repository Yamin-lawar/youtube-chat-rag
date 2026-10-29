CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "conversation_videos" (
	"conversation_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	CONSTRAINT "conversation_videos_conversation_id_video_id_pk" PRIMARY KEY("conversation_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_videos" (
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_videos_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"channel" text,
	"thumbnail_url" text NOT NULL,
	"status" "video_status" DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"chunk_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "videos_youtube_id_unique" UNIQUE("youtube_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_videos" ADD CONSTRAINT "conversation_videos_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_videos" ADD CONSTRAINT "conversation_videos_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_videos" ADD CONSTRAINT "user_videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_videos" ADD CONSTRAINT "user_videos_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;