import type { agentRunTable } from "../../database/schema";
import type { WorkRunKind } from "../agent-types";

type RunRow = typeof agentRunTable.$inferSelect & {
  kind: WorkRunKind;
  requestedByName: string | null;
};

export function toAgentRun(run: RunRow) {
  return {
    id: run.id,
    kind: run.kind,
    status: run.status,
    requestedBy:
      run.requestedByUserId && run.requestedByName
        ? { id: run.requestedByUserId, name: run.requestedByName }
        : null,
    cancelRequested: run.cancelRequestedAt !== null,
    result: run.result ?? null,
    errorCode: run.errorCode,
    error: run.error,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}
