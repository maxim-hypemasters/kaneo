import { useEffect } from "react";

const BUSY_REFETCH_MS = 5000;

/**
 * While another tab answers in the chat, refetches it now and then, so its
 * answer shows here and the busy line clears when it finishes. The chat
 * query otherwise stays fresh for 30 seconds.
 */
export function useRefetchWhileBusy(busy: boolean, refetch: () => unknown) {
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => void refetch(), BUSY_REFETCH_MS);
    return () => window.clearInterval(timer);
  }, [busy, refetch]);
}
