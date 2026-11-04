import { ArrowUp } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';

interface ComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

const MAX_HEIGHT_PX = 200;

/** The message box: grows with the text, Enter sends, Shift+Enter adds a line. */
export function Composer({ disabled, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0 && !disabled;

  function resize() {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function send() {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    // The box shrinks back once the text is gone; wait for React to clear it first.
    requestAnimationFrame(resize);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl transition-colors focus-within:border-accent/60">
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={text}
          rows={1}
          autoFocus
          placeholder="Ask anything about the videos…"
          onChange={(event) => {
            setText(event.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
          className="max-h-50 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-ink outline-none placeholder:text-muted"
        />
        <button
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all',
            canSend
              ? 'bg-linear-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30 hover:scale-105'
              : 'bg-surface-3 text-muted',
          )}
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );
}
