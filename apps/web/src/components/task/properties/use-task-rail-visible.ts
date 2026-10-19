import { useSyncExternalStore } from "react";
const query = "(min-width: 1024px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;
// Match the existing lg breakpoint. The overview mounts in one placement,
// rather than leaving duplicate controls and dialogs hidden with CSS.
export function useTaskRailVisible() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
