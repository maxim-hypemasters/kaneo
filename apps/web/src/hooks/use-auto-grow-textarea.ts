import { useLayoutEffect, useRef } from "react";

// Grows a one-row textarea to fit its content so long titles wrap instead of
// scrolling sideways out of view, which on phones hid most of the title.
// Pass `active` false while the textarea is not rendered (a read-only heading
// shows instead), so it is fitted once it appears.
export function useAutoGrowTextarea(value: string, active = true) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!active || !textarea) return;
    const fit = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    // Re-fit when the width changes (rotation, resizing a sheet).
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth === width) return;
      width = textarea.clientWidth;
      fit();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [value, active]);

  return ref;
}
