import { HTTPException } from "hono/http-exception";

export function assertNoFeatureRelation(...tasks: { type: string }[]) {
  if (tasks.some((task) => task.type === "feature"))
    throw new HTTPException(400, {
      message: "Features do not have relations",
    });
}
