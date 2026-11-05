import { useSyncExternalStore } from "react";

let current = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const update = () => {
  current = Date.now();
  for (const listener of listeners) listener();
};
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    update();
    timer = setInterval(update, 60_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    }
  };
}
const snapshot = () => current;

// One shared clock keeps exact scheduled finishes current without a timer per row.
export function useCurrentMinute() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
