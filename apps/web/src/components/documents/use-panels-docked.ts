import { useSyncExternalStore } from "react";

const query = "(min-width: 1024px)";

const supported = () => typeof window.matchMedia === "function";

function subscribe(onChange: () => void) {
  if (!supported()) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const snapshot = () => supported() && window.matchMedia(query).matches;
const serverSnapshot = () => false;

// From the lg breakpoint an open document's side panels, its documents list
// and its comments, sit beside it; below it each covers the document while
// open.
export function usePanelsDocked() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
