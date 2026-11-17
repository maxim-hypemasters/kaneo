import type db from "../database";
import { readTriageRouting } from "./read-triage-members";
import { routeCreationStatus, TRIAGE_STATUS } from "./triage-status";

// The status new work starts in. Work from someone outside a project's
// triage list waits in Triage, whatever status the client asked for.
export async function routeNewWork<T extends string | null | undefined>(
  database: Pick<typeof db, "select">,
  {
    projectId,
    type,
    requested,
    userId,
  }: {
    projectId: string;
    type: string;
    requested: T;
    userId: string | null | undefined;
  },
): Promise<T | typeof TRIAGE_STATUS> {
  if (type !== "task" && type !== "bug") return requested;
  const routing = await readTriageRouting(projectId, userId, database);
  return routeCreationStatus({ type, requested, ...routing });
}
