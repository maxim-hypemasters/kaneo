import { TRIAGE_STATUS } from "../../triage/triage-status";

type Json = Record<string, unknown>;

// Work waiting in Triage leaves it only when a triage member accepts or
// declines it, which the assistant never does.
const STATUS_CHANGES: ReadonlySet<string> = new Set([
  "update_task",
  "update_task_status",
]);

/** A proposal refused because its task is waiting in Triage. */
export const TRIAGE_TASK =
  "This task is waiting in Triage, so the assistant can't change its status: only a triage member can accept or decline it, in the project's Triage view. Nothing was proposed.";

/** Whether a proposal sets the status of a task waiting in Triage. */
export function changesTriageStatus(
  toolName: string,
  entity: Json | null,
  args: Json,
): boolean {
  return (
    STATUS_CHANGES.has(toolName) &&
    entity?.status === TRIAGE_STATUS &&
    typeof args.status === "string"
  );
}
