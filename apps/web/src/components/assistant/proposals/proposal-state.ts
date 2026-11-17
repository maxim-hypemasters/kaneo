import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";

export type ProposalState =
  | "pending"
  | "succeeded"
  | "failed"
  // Approved, but it may or may not have run: the request timed out, or the
  // server stopped mid-write.
  | "unknown"
  | "rejected"
  | "skipped";

// Mirrors OUTCOME_UNKNOWN in apps/api/src/assistant/proposals/
// execute-approved.ts: the error a write that timed out is saved with.
export const OUTCOME_UNKNOWN_ERROR = "Outcome unknown; check before retrying.";

type ProposalRow = Pick<
  AssistantMessage,
  "approval" | "isError" | "errorText" | "resultSummary"
>;

/** Where a proposed change stands, from its tool row. */
export function proposalState(row: ProposalRow): ProposalState {
  switch (row.approval) {
    case "rejected":
      return "rejected";
    case "skipped":
      return "skipped";
    case "approved":
      if (row.isError) {
        return row.errorText === OUTCOME_UNKNOWN_ERROR ? "unknown" : "failed";
      }
      return row.resultSummary ? "succeeded" : "unknown";
    default:
      return "pending";
  }
}

/**
 * Whether the change may have written something, so cached work elsewhere
 * should be refreshed: it ran, or its outcome is unknown.
 */
export function mayHaveWritten(row: ProposalRow): boolean {
  const state = proposalState(row);
  return state === "succeeded" || state === "unknown";
}
