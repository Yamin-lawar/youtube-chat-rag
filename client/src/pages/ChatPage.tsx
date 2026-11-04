import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, MessageSquareOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { askQuestion } from '../api/chatStream';
import { CONVERSATIONS_KEY, conversationKey, useConversation } from '../api/conversations';
import type { ConversationDetail, Source } from '../api/types';
import { Composer } from '../components/Composer';
import { AssistantMessage, UserMessage } from '../components/MessageBubble';
import { useStickToBottom, useTypewriter } from '../hooks';

/** An answer that is being written right now, before it has been reloaded from the server. */
interface LiveTurn {
  question: string;
  text: string;
  sources: Source[];
  status: 'waiting' | 'streaming' | 'done' | 'failed';
  /** How many saved messages existed when the question was asked. */
  savedCount: number;
}

const SUGGESTIONS = [
  'Summarize the main points',
  'What are the key takeaways?',
  'What topics are covered?',
  'Which claims are the most surprising?',
];

export function ChatPage() {
  const { id = '' } = useParams();
  // Keyed by id so opening another chat starts with a clean slate.
  return <ChatLoader key={id} id={id} />;
}

function ChatLoader({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const finishing = useRef(false);
  const { data, isLoading, isError } = useConversation(id, live !== null);

  /** Reloads the saved messages and only then drops the live copy, so nothing flickers. */
  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    await queryClient.invalidateQueries({ queryKey: conversationKey(id) });
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    setLive(null);
    finishing.current = false;
  }

  async function send(question: string) {
    if (!data || live) return;
    setSendError(null);
    setLive({
      question,
      text: '',
      sources: [],
      status: 'waiting',
      savedCount: data.messages.length,
    });

    let started = false;
    try {
      for await (const event of askQuestion(id, question)) {
        if (event.type === 'start') started = true;
        if (event.type === 'sources') {
          setLive((l) => l && { ...l, sources: event.sources, status: 'streaming' });
        } else if (event.type === 'token') {
          setLive((l) => l && { ...l, text: l.text + event.text, status: 'streaming' });
        } else if (event.type === 'done') {
          // The typewriter calls finish() once it has revealed the last words.
          setLive((l) => l && { ...l, status: 'done' });
        } else if (event.type === 'error') {
          setLive((l) => l && { ...l, status: 'failed' });
          await finish();
        }
      }
      // The connection closed without a done or error event. The server keeps writing the
      // answer, so reload and let the conversation poll until it is finished.
      if (!finishing.current) setLive((l) => (l?.status === 'done' ? l : null));
      if (started) await finish();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Something went wrong');
      if (started) await finish();
      else setLive(null);
    }
  }

  if (isLoading) return <div className="h-full animate-pulse" />;

  if (isError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <MessageSquareOff size={36} className="text-muted" />
        <p className="text-muted">This chat does not exist.</p>
        <Link to="/" className="text-sm font-medium text-violet-300 hover:underline">
          Back to your library
        </Link>
      </div>
    );
  }

  return (
    <ChatThread
      conversation={data}
      live={live}
      sendError={sendError}
      onSend={(question) => void send(question)}
      onCaughtUp={() => void finish()}
    />
  );
}

interface ChatThreadProps {
  conversation: ConversationDetail;
  live: LiveTurn | null;
  sendError: string | null;
  onSend: (question: string) => void;
  onCaughtUp: () => void;
}

function ChatThread({ conversation, live, sendError, onSend, onCaughtUp }: ChatThreadProps) {
  const { scrollRef, contentRef, onScroll, scrollToBottom, showJump } = useStickToBottom();

  const videoTitles = useMemo(
    () => new Map(conversation.videos.map((video) => [video.youtubeId, video.title])),
    [conversation.videos],
  );

  // While a live answer is shown, hide the rows the server has already saved for it.
  const saved = live ? conversation.messages.slice(0, live.savedCount) : conversation.messages;
  const answerInProgress = saved.some((m) => m.status === 'streaming');
  const busy = live !== null || answerInProgress;
  const last = saved.at(-1);

  function retry() {
    const question = saved.findLast((m) => m.role === 'user')?.content;
    if (question) onSend(question);
  }

  // After sending, jump to the newest message even if the reader had scrolled up.
  useEffect(() => {
    if (live?.status === 'waiting') scrollToBottom();
  }, [live?.status, scrollToBottom]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line px-5 py-3.5 md:px-8">
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{conversation.title}</h1>
        <div className="flex -space-x-2.5">
          {conversation.videos.map((video) => (
            <img
              key={video.id}
              src={video.thumbnailUrl}
              alt={video.title}
              title={video.title}
              className="h-8 w-14 rounded-md border-2 border-canvas object-cover"
            />
          ))}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
          <div ref={contentRef} className="mx-auto max-w-3xl space-y-8 px-4 py-8">
            {saved.length === 0 && !live && (
              <EmptyChat videos={conversation.videos} onPick={onSend} disabled={busy} />
            )}

            {saved.map((message) =>
              message.role === 'user' ? (
                <UserMessage key={message.id} content={message.content} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  content={message.content}
                  sources={message.sources ?? []}
                  status={message.status}
                  videoTitles={videoTitles}
                  typing={message.status === 'streaming'}
                  thinking={message.status === 'streaming' && !message.content}
                  onRetry={message === last ? retry : undefined}
                />
              ),
            )}

            {live && (
              <>
                <UserMessage content={live.question} />
                <LiveAnswer live={live} videoTitles={videoTitles} onCaughtUp={onCaughtUp} />
              </>
            )}
          </div>
        </div>

        {showJump && (
          <button
            onClick={scrollToBottom}
            aria-label="Scroll to newest message"
            className="absolute bottom-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface-2 shadow-xl transition-colors hover:bg-surface-3"
          >
            <ArrowDown size={16} />
          </button>
        )}
      </div>

      <div className="px-4 pb-5 pt-2">
        <div className="mx-auto max-w-3xl">
          {sendError && <p className="mb-2 px-2 text-sm text-red-300">{sendError}</p>}
          <Composer disabled={busy} onSend={onSend} />
          <p className="mt-2 text-center text-xs text-muted">
            Answers come only from the selected videos. Check the sources before you rely on them.
          </p>
        </div>
      </div>
    </div>
  );
}

function LiveAnswer({
  live,
  videoTitles,
  onCaughtUp,
}: {
  live: LiveTurn;
  videoTitles: Map<string, string>;
  onCaughtUp: () => void;
}) {
  const typed = useTypewriter(live.text);
  const caughtUp = typed.length >= live.text.length;

  useEffect(() => {
    if (live.status === 'done' && caughtUp) onCaughtUp();
  }, [live.status, caughtUp, onCaughtUp]);

  return (
    <AssistantMessage
      content={typed}
      sources={live.sources}
      status={live.status === 'failed' ? 'failed' : 'streaming'}
      videoTitles={videoTitles}
      typing={live.status !== 'failed'}
      thinking={live.status === 'waiting'}
    />
  );
}

function EmptyChat({
  videos,
  onPick,
  disabled,
}: {
  videos: ConversationDetail['videos'];
  onPick: (question: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center pt-8 text-center md:pt-16">
      <div className="flex -space-x-4">
        {videos.map((video, i) => (
          <img
            key={video.id}
            src={video.thumbnailUrl}
            alt=""
            style={{ transform: `rotate(${(i - (videos.length - 1) / 2) * 6}deg)` }}
            className="h-20 w-36 rounded-xl border-2 border-canvas object-cover shadow-2xl"
          />
        ))}
      </div>
      <h2 className="mt-8 text-2xl font-bold tracking-tight">What would you like to know?</h2>
      <p className="mt-2 text-sm text-muted">
        Chatting with {videos.length} {videos.length === 1 ? 'video' : 'videos'}
      </p>
      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            disabled={disabled}
            onClick={() => onPick(suggestion)}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-muted transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:text-ink disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
