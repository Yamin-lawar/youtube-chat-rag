import { Link2, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAddVideo } from '../api/videos';

/** The "paste a YouTube link" box at the top of the library. */
export function AddVideoForm() {
  const [url, setUrl] = useState('');
  const addVideo = useAddVideo();

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || addVideo.isPending) return;
    addVideo.mutate(trimmed, { onSuccess: () => setUrl('') });
  }

  return (
    <form onSubmit={submit}>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xl shadow-black/30 transition-colors focus-within:border-accent/60">
        <Link2 size={18} className="ml-3 shrink-0 text-muted" />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a YouTube link…"
          aria-label="YouTube link"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!url.trim() || addVideo.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-linear-to-br from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all enabled:hover:brightness-110 disabled:opacity-40"
        >
          <Plus size={16} />
          {addVideo.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {addVideo.isError && (
        <p className="mt-2 px-2 text-sm text-red-300">{addVideo.error.message}</p>
      )}
    </form>
  );
}
