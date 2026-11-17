import { z } from "zod";
import type { ToolClient, ToolRegistrar } from "./register.js";
import { registerTool } from "./register-tool.js";

const taskId = z.string().trim().min(1);
const reason = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .optional()
  .describe(
    "Why the work was declined. Posted as a comment from you and sent to the reporter.",
  );

const PERMISSION =
  "Only the project's triage members may do this; when the project has none, holders of project:update may clear work still waiting.";

export function registerTriageTools(
  server: ToolRegistrar,
  client: ToolClient,
): void {
  // Both tools change a task's status, so neither is read-only.
  function register<S extends z.ZodObject>(
    name: string,
    description: string,
    schema: S,
    request: (args: z.output<S>) => Promise<unknown>,
  ) {
    registerTool(
      server,
      name,
      {
        description,
        inputSchema: schema,
        annotations: { readOnlyHint: false },
      },
      request,
    );
  }
  const triagePath = (id: string, outcome: "accept" | "decline") =>
    `/api/triage/task/${encodeURIComponent(id)}/${outcome}`;

  register(
    "accept_triage_task",
    `Accept a Task or Bug waiting in the 'triage' status. It moves to the To Do column, or the project's first open column when there is no To Do, and its reporter is notified. ${PERMISSION} Returns the updated task.`,
    z.object({ taskId }),
    (args) =>
      client.json(triagePath(args.taskId, "accept"), { method: "POST" }),
  );
  register(
    "decline_triage_task",
    `Decline a Task or Bug waiting in the 'triage' status. It moves to Archived, the optional reason is posted as a comment, and its reporter is notified. ${PERMISSION} Returns the updated task.`,
    z.object({ taskId, reason }),
    (args) =>
      client.json(triagePath(args.taskId, "decline"), {
        method: "POST",
        body: JSON.stringify(
          args.reason === undefined ? {} : { reason: args.reason },
        ),
      }),
  );
}
