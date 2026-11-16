import { routeCreationStatus, TRIAGE_STATUS } from "./triage-status";

export type TriageRouting = { triageEnabled: boolean; isMember: boolean };

// Bulk issue imports route open issues like work from the importing user;
// closed issues arrive done.
export function routeImportedIssue(
  routing: TriageRouting,
  open: boolean,
  requested: string,
) {
  if (!open) return requested;
  return routeCreationStatus({ type: "task", requested, ...routing });
}

// Status labels on a re-import don't move work out of Triage.
export function keepsTriage(status: string | null | undefined) {
  return status === TRIAGE_STATUS;
}
