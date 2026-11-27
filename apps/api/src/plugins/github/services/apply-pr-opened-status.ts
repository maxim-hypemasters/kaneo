import { publishEvent } from "../../../events";
import type { GitHubConfig } from "../config";
import { resolveTargetStatus } from "../utils/resolve-column";
import type { IntegrationDatabase } from "./integration-task-scope";
import { updateTaskStatus } from "./task-service";

export async function applyPrOpenedStatus({
  projectId,
  task,
  config,
  database,
  afterCommit,
}: {
  projectId: string;
  task: { id: string; status: string | null };
  config: GitHubConfig;
  database: IntegrationDatabase;
  afterCommit: (effect: () => Promise<void>) => void;
}) {
  const targetStatus = await resolveTargetStatus(
    projectId,
    "pr_opened",
    config.statusTransitions?.onPROpen || "in-review",
    database,
  );
  if (task.status === targetStatus) return;

  const result = await updateTaskStatus(task.id, targetStatus, database);
  if (!result.applied || result.before.status === result.after.status) return;

  afterCommit(() =>
    publishEvent("task.status_changed", {
      taskId: result.after.id,
      projectId: result.after.projectId,
      userId: null,
      oldStatus: result.before.status,
      newStatus: result.after.status,
      title: result.after.title,
      assigneeId: result.after.userId,
      type: "status_changed",
    }),
  );
}
