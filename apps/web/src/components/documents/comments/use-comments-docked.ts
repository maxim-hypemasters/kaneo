import { useSyncExternalStore } from "react";

const query = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

// From the lg breakpoint the comments panel sits beside the document;
// below it the panel covers the document while it is open.
export function useCommentsDocked() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
