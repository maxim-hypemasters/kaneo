import db from "../../database";
import { workspaceAgentRunnerTable } from "../../database/schema";
import { generateRunnerToken } from "../runner-token";
import { loadWorkspaceRunner, toRunnerStatus } from "./load-workspace-runner";

/** Issues a new runner token; the previous one stops working at once. */
export async function rotateRunnerToken(workspaceId: string, userId: string) {
  const { token, hash, prefix } = generateRunnerToken();
  const values = {
    tokenHash: hash,
    tokenPrefix: prefix,
    createdByUserId: userId,
    createdAt: new Date(),
    lastSeenAt: null,
    runnerVersion: null,
  };
  await db
    .insert(workspaceAgentRunnerTable)
    .values({ workspaceId, ...values })
    .onConflictDoUpdate({
      target: workspaceAgentRunnerTable.workspaceId,
      set: values,
    });
  return {
    token,
    status: toRunnerStatus(await loadWorkspaceRunner(workspaceId)),
  };
}
