import { useCallback, useEffect, useRef, useState } from "react";

// How close to the end still counts as reading the latest message.
const STICK_THRESHOLD_PX = 80;

/**
 * Keeps a scroll area pinned to its newest content while the reader is at
 * (or within 80px of) the bottom, and leaves it alone once they scroll up
 * to read something older. `atBottom` drives a "Jump to latest" control.
 * Both refs must be attached when the component mounts.
 */
export function useStickToBottom() {
  const viewportRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    stickRef.current = true;
    setAtBottom(true);
    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const onScroll = () => {
      const distance =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      stickRef.current = distance <= STICK_THRESHOLD_PX;
      setAtBottom(stickRef.current);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.scrollTop = viewport.scrollHeight;

    if (typeof ResizeObserver === "undefined") {
      return () => viewport.removeEventListener("scroll", onScroll);
    }
    const observer = new ResizeObserver(() => {
      if (stickRef.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return { viewportRef, contentRef, atBottom, scrollToBottom };
}
