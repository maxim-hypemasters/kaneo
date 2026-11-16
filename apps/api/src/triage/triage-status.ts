import { HTTPException } from "hono/http-exception";

export const TRIAGE_STATUS = "triage";

// Only Tasks and Bugs have a workflow status, so only they wait in Triage.
export function routeCreationStatus<T extends string | null | undefined>({
  type,
  requested,
  triageEnabled,
  isMember,
}: {
  type: string;
  requested: T;
  triageEnabled: boolean;
  isMember: boolean;
}): T | typeof TRIAGE_STATUS {
  if (type !== "task" && type !== "bug") return requested;
  return triageEnabled && !isMember ? TRIAGE_STATUS : requested;
}

// Triage is entered only by the creation rule and left only through Accept
// or Decline. Resending the current status is not a transition.
export function assertTriageTransition(
  current: string | null | undefined,
  next: string | null | undefined,
) {
  if (next === undefined || next === current) return;
  if (next === TRIAGE_STATUS)
    throw new HTTPException(400, {
      message: "Only new work from people outside triage goes to Triage",
    });
  if (current === TRIAGE_STATUS)
    throw new HTTPException(409, {
      message: "Accept or decline this task in Triage first",
    });
}
