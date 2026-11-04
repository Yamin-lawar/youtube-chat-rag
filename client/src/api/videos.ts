import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';
import type { Video } from './types';

const VIDEOS_KEY = ['videos'] as const;
const POLL_WHILE_PROCESSING_MS = 3000;

export function useVideos() {
  return useQuery({
    queryKey: VIDEOS_KEY,
    queryFn: () => request<Video[]>('/videos'),
    // Ingestion runs in the background and takes a while, so check back until it finishes.
    refetchInterval: (query) =>
      query.state.data?.some((video) => video.status === 'processing')
        ? POLL_WHILE_PROCESSING_MS
        : false,
  });
}

export function useAddVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      request<Video>('/videos', { method: 'POST', body: JSON.stringify({ url }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VIDEOS_KEY }),
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/videos/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VIDEOS_KEY }),
  });
}
