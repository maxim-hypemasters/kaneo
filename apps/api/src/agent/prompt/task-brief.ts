import type { TaskContext } from "../../agent-runner/controllers/build-task-context";

// A port of apps/agent-runner/src/task-brief.ts: the runner image builds
// only its own source, so the two copies change together.

export type BriefContext = Pick<
  TaskContext,
  "task" | "comments" | "clarifications" | "relatedTasks"
> & { project: Pick<TaskContext["project"], "instructions"> };

const fence = (text: string) => `<<<\n${text.trim() || "(empty)"}\n>>>`;

/** The task as the prompts present it: data, clearly delimited. */
export function taskBrief(context: BriefContext): string {
  const { task } = context;
  const lines = [
    `Ticket: ${task.ticketId} (${task.type})`,
    `Title: ${task.title}`,
    `Priority: ${task.priority ?? "none"} · Status: ${task.status ?? "none"}`,
    task.labels.length ? `Labels: ${task.labels.join(", ")}` : null,
    `Link: ${task.url}`,
    "",
    "Description:",
    fence(task.description),
  ];
  if (context.clarifications.length) {
    lines.push(
      "",
      "Decisions the team already made (answers to earlier questions):",
    );
    for (const item of context.clarifications)
      lines.push(`- Q: ${item.question}\n  A: ${item.answer}`);
  }
  if (context.comments.length) {
    lines.push("", "Recent comments, oldest first:");
    for (const comment of context.comments)
      lines.push(`- ${comment.author}: ${fence(comment.content)}`);
  }
  if (context.relatedTasks.length) {
    lines.push("", "Related tasks:");
    for (const related of context.relatedTasks)
      lines.push(
        `- ${related.ticketId} (${related.relation}): ${related.title}`,
      );
  }
  if (context.project.instructions.trim())
    lines.push(
      "",
      "Project instructions from the team:",
      fence(context.project.instructions),
    );
  return lines.filter((line) => line !== null).join("\n");
}
