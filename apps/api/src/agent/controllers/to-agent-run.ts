import type { agentRunTable } from "../../database/schema";

type RunRow = typeof agentRunTable.$inferSelect & {
  requestedByName: string | null;
};

export function toAgentRun(run: RunRow) {
  return {
    id: run.id,
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
