import type { TimeOffEntry, TimeOffRequest } from "@/fetchers/time-off/types";

// Calendar entries carry every request field only when they are the
// viewer's own or the viewer can approve; other members' entries are just
// who and when.
export function isTimeOffRequest(entry: TimeOffEntry): entry is TimeOffRequest {
  return (
    entry.workspaceId !== undefined &&
    entry.type !== undefined &&
    entry.status !== undefined &&
    entry.days !== undefined &&
    entry.daysByYear !== undefined &&
    entry.version !== undefined &&
    entry.canEdit !== undefined &&
    entry.canCancel !== undefined &&
    entry.canDecide !== undefined
  );
}
