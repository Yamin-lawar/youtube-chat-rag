import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shows `target` a few characters at a time. Model tokens arrive in bursts (hundreds in a
 * fraction of a second), which looks jumpy. Revealing them frame by frame, faster when the
 * backlog is large, gives the steady word-by-word flow without ever falling far behind.
 */
export function useTypewriter(target: string): string {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= target.length) return;
    const frame = requestAnimationFrame(() => {
      setShown((current) => {
        const backlog = target.length - current;
        return Math.min(target.length, current + Math.max(1, Math.ceil(backlog / 12)));
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [shown, target]);

  return target.slice(0, shown);
}

const NEAR_BOTTOM_PX = 80;

/**
 * Keeps a scrolling chat pinned to the newest text while an answer streams, but stops
 * following as soon as the reader scrolls up, so they can read in peace.
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    // Fires whenever the text grows, which is exactly when we may need to scroll.
    const observer = new ResizeObserver(() => {
      if (stuck.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    stuck.current = distance < NEAR_BOTTOM_PX;
    setShowJump(!stuck.current);
  }, []);

  const scrollToBottom = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    stuck.current = true;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  }, []);

  return { scrollRef, contentRef, onScroll, scrollToBottom, showJump };
}
