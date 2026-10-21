import { HTTPException } from "hono/http-exception";

export type MilestoneDates = {
  startDate?: string | null;
  endDate?: string | null;
};

export function milestoneDatesAreOrdered({
  startDate,
  endDate,
}: MilestoneDates) {
  return startDate == null || endDate == null || startDate <= endDate;
}

export function assertReadonlyMilestoneDates(fields: object) {
  if (Object.hasOwn(fields, "startDate") || Object.hasOwn(fields, "endDate")) {
    throw new HTTPException(400, {
      message: "Milestone dates are derived from linked Tasks and Bugs",
    });
  }
}
