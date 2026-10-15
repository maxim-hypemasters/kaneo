export const GANTT_LANE_ATTRIBUTE = "data-gantt-lane";

// The lane under a viewport point. Hit-testing the live DOM keeps working
// while the timeline scrolls, and the sticky date header (which carries no
// lane attribute) resolves to null.
export function laneKeyAtPoint(x: number, y: number): string | null {
  if (typeof document.elementFromPoint !== "function") return null;
  return (
    document
      .elementFromPoint(x, y)
      ?.closest(`[${GANTT_LANE_ATTRIBUTE}]`)
      ?.getAttribute(GANTT_LANE_ATTRIBUTE) ?? null
  );
}
