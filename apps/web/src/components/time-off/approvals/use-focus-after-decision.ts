import { type RefObject, useEffect, useRef, useState } from "react";

type Decided = { id: string; index: number };

// Keeps keyboard focus in the approvals list when a decided request leaves
// it: on the first action of the request now in its place (or the last one),
// or on the heading once the list is empty. Focus the user moved elsewhere
// in the meantime stays where it is. A list whose own heading leaves with its
// last request passes a heading that stays as `fallbackRef`.
export function useFocusAfterDecision(
  requests: readonly { id: string }[] | undefined,
  fallbackRef?: RefObject<HTMLElement | null>,
) {
  const listRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [decided, setDecided] = useState<Decided | null>(null);
  const handled = useRef<Decided | null>(null);

  useEffect(() => {
    if (!decided || handled.current === decided || !requests) return;
    if (requests.some((request) => request.id === decided.id)) return;
    handled.current = decided;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const rows = listRef.current?.children ?? [];
    const row = rows[Math.min(decided.index, rows.length - 1)];
    const action = row?.querySelector<HTMLElement>("button:not(:disabled)");
    (action ?? (fallbackRef ?? headingRef).current)?.focus();
  }, [decided, requests, fallbackRef]);

  return {
    listRef,
    headingRef,
    // Call once the request at `index` is decided and about to leave.
    onDecided: (id: string, index: number) => setDecided({ id, index }),
  };
}
