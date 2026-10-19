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

export function assertMilestoneDates(dates: MilestoneDates) {
  if (!milestoneDatesAreOrdered(dates)) {
    throw new HTTPException(400, {
      message: "Milestone start date must be on or before end date",
    });
  }
}
