import { z } from "../../openapi";
import { isoDay } from "../release-dates";
import { isProgressTimeZone } from "./progress-day";

export const releaseProgressQuery = z.object({
  timeZone: z
    .string()
    .min(1)
    .max(100)
    .refine(isProgressTimeZone, "Expected an IANA timezone")
    .default("UTC")
    .openapi({
      description:
        "IANA timezone used for calendar-day totals. Defaults to UTC.",
      example: "Europe/Belgrade",
    }),
});

const counts = z.object({
  scope: z.number().int().nonnegative(),
  started: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

export const releaseProgressHistorySchema = z
  .object({
    trackedFrom: z.string().datetime().openapi({
      description:
        "Tracking began at this instant. Earlier totals are unknown.",
    }),
    today: isoDay,
    current: counts,
    points: z.array(counts.extend({ date: isoDay })),
  })
  .openapi("ReleaseProgressHistory");
