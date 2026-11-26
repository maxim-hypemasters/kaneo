import type { RunContext } from "../kaneo/client";

export function pullRequestBody(context: RunContext, summary: string) {
  return `${summary.trim() || "_Hermes did not leave a summary._"}

---
Kaneo: [${context.task.ticketId}](${context.task.url}) · opened by Hermes Agent through Kaneo's AI agent runner.`;
}
