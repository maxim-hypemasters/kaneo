import { HTTPException } from "hono/http-exception";

export default async function updateTaskDueDate(_input: {
  id: string;
  dueDate: Date | null;
  currentUserId: string;
}): Promise<never> {
  throw new HTTPException(400, {
    message: "Task dates are read-only; use an estimate and Preview plan",
  });
}
