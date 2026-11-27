import { buildTaskContext } from "../../agent-runner/controllers/build-task-context";
import { buildHandoffPrompt } from "../prompt/build-handoff-prompt";
import { requireAgentTask } from "./require-agent-task";

/** The prompt Copy prompt puts on the clipboard, built from the task now. */
export async function getTaskPrompt(
  taskId: string,
  options: { includeInstructions: boolean },
) {
  const { setting, ...loaded } = await requireAgentTask(taskId);
  const context = await buildTaskContext(loaded, setting);
  return {
    prompt: buildHandoffPrompt(context, options),
    branchName: context.branchName,
  };
}
