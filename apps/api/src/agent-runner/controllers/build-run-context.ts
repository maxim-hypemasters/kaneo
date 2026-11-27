import type { agentRunTable } from "../../database/schema";
import { assessmentJsonSchema } from "../../agent/assessment-schema";
import { loadAgentTask } from "../../agent/controllers/load-agent-task";
import { loadEffectiveAgentSetting } from "../../agent/controllers/load-project-agent-setting";
import { loadPlanningContext } from "../../agent/suggestions/load-planning-context";
import { buildTaskContext } from "./build-task-context";

/** Everything a runner needs about the task, read fresh at claim time. */
export async function buildRunContext(run: typeof agentRunTable.$inferSelect) {
  const loaded = await loadAgentTask(run.taskId);
  if (!loaded) return null;
  const assess = run.kind === "assess";
  const [setting, planning] = await Promise.all([
    loadEffectiveAgentSetting(loaded.task.projectId),
    assess ? loadPlanningContext(loaded.task) : null,
  ]);
  const context = await buildTaskContext(loaded, setting);

  return {
    projectId: loaded.task.projectId,
    inputHash: loaded.inputHash,
    payload: {
      ...context,
      resultSchema: assess ? assessmentJsonSchema() : null,
      planning,
    },
  };
}
