import { type RefObject, useEffect, useRef } from "react";

// The headings of waiting cards carry this attribute and tabIndex -1.
const NEXT_PENDING = "[data-pending-proposal]";

/**
 * Once a decision comes back, moves focus to the next waiting card's
 * heading, so its title and changes are read before anything is approved,
 * or to the composer when none waits. The clicked button was disabled
 * meanwhile, so focus would otherwise be lost. Focus the user moved
 * elsewhere in the meantime stays where it is.
 */
export function useFocusAfterDecision(
  deciding: boolean,
  rootRef: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLTextAreaElement | null>,
) {
  const wasDeciding = useRef(false);

  useEffect(() => {
    if (deciding) {
      wasDeciding.current = true;
      return;
    }
    if (!wasDeciding.current) return;
    wasDeciding.current = false;

    const root = rootRef.current;
    const active = document.activeElement;
    if (!root || (active && active !== document.body && !root.contains(active)))
      return;
    const next = root.querySelector<HTMLElement>(NEXT_PENDING);
    (next ?? composerRef.current)?.focus();
  }, [deciding, rootRef, composerRef]);
}
