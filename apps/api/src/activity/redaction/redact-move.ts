import type { EventData } from "./event-data";

const SIDES = ["from", "to"] as const;

// A "moved" event names the projects on both sides of the move.
export function moveProjectIds(data: EventData) {
  return SIDES.map((side) => data[`${side}ProjectId`]).filter(
    (id): id is string => typeof id === "string",
  );
}

// Hides each side the viewer can't see. Returns data itself when nothing is
// hidden.
export function redactMove(
  data: EventData,
  isVisible: (projectId: string) => boolean,
): EventData {
  let redacted = data;
  for (const side of SIDES) {
    const projectId = data[`${side}ProjectId`];
    if (typeof projectId === "string" && !isVisible(projectId)) {
      redacted = {
        ...redacted,
        [`${side}ProjectId`]: null,
        [`${side}ProjectName`]: null,
      };
    }
  }
  return redacted;
}
