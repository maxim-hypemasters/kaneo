import { z } from "../openapi";
import { HTTPException } from "hono/http-exception";

export const estimateSecondsSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483_640)
  .multipleOf(60)
  .nullable()
  .openapi({
    description:
      "Total effort in seconds, in whole-minute increments. Null clears the estimate; independent of the displayed hours/days unit.",
  });

export function assertEstimateSeconds(value: number | null | undefined) {
  if (value !== undefined && !estimateSecondsSchema.safeParse(value).success)
    throw new HTTPException(400, {
      message: "Estimate must be positive whole minutes",
    });
}

export function assertNoTaskDateWrites(value: object) {
  if (Object.hasOwn(value, "startDate") || Object.hasOwn(value, "dueDate"))
    throw new HTTPException(400, {
      message: "Task dates are read-only; use an estimate and Preview plan",
    });
}
