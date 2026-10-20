import { HTTPException } from "hono/http-exception";

export function assertLeafPlanning(task: { type: string }) {
  if (task.type === "feature")
    throw new HTTPException(400, {
      message: "Features do not have planning fields",
    });
}
