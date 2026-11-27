import type { RunContext } from "./kaneo/client";

// apps/api/src/agent/prompt/task-brief.ts is a port of this for the Copy
// prompt, since the runner image builds only this package's source: the two
// copies change together.

const fence = (text: string) => `<<<\n${text.trim() || "(empty)"}\n>>>`;

/** The task as both prompts present it: data, clearly delimited. */
export function taskBrief(context: RunContext): string {
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
