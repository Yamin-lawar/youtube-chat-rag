import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';
import type { Conversation, ConversationDetail } from './types';

export const CONVERSATIONS_KEY = ['conversations'] as const;
export const conversationKey = (id: string) => ['conversation', id] as const;

const POLL_WHILE_STREAMING_MS = 1500;

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => request<Conversation[]>('/conversations'),
  });
}

/**
 * One conversation with its messages. If an answer is still being written on the server
 * (for example after a page reload), it checks back until that answer is finished.
 */
export function useConversation(id: string, isStreamingHere: boolean) {
  return useQuery({
    queryKey: conversationKey(id),
    queryFn: () => request<ConversationDetail>(`/conversations/${id}`),
    refetchInterval: (query) =>
      !isStreamingHere && query.state.data?.messages.some((m) => m.status === 'streaming')
        ? POLL_WHILE_STREAMING_MS
        : false,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (videoIds: string[]) =>
      request<Conversation>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ videoIds }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  });
}

/** Switches a video of a chat on or off. The change shows immediately and rolls back on failure. */
export function useSetVideoActive(conversationId: string) {
  const queryClient = useQueryClient();
  const key = conversationKey(conversationId);

  return useMutation({
    mutationFn: ({ videoId, active }: { videoId: string; active: boolean }) =>
      request<Conversation>(`/conversations/${conversationId}/videos/${videoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    onMutate: async ({ videoId, active }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<ConversationDetail>(key);
      queryClient.setQueryData<ConversationDetail>(
        key,
        (old) =>
          old && {
            ...old,
            videos: old.videos.map((v) => (v.id === videoId ? { ...v, active } : v)),
          },
      );
      return { before };
    },
    onError: (_error, _variables, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  });
}
