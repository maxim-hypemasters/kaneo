import { HTTPException } from "hono/http-exception";
import { agentError } from "../agent-error";
import { loadAgentTask } from "./load-agent-task";
import { loadEffectiveAgentSetting } from "./load-project-agent-setting";

/** A task or bug in a project that has the agent turned on. */
export async function requireAgentTask(taskId: string) {
  const loaded = await loadAgentTask(taskId);
  if (!loaded) throw new HTTPException(404, { message: "Task not found" });
  if (!loaded.task.isWorkItem) throw agentError("AI_AGENT_NOT_WORK_ITEM");
  const setting = await loadEffectiveAgentSetting(loaded.task.projectId);
  if (!setting.enabled) throw agentError("AI_AGENT_NOT_ENABLED");
  return { ...loaded, setting };
}
