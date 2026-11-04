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

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY }),
  });
}
