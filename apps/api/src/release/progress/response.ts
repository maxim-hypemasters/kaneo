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
    startScope: z.number().int().nonnegative().nullable().openapi({
      description:
        "Task/Bug scope strictly before local midnight on the release start date in the requested timezone. Null before the release starts or when tracking did not begin strictly before that boundary.",
    }),
    current: counts,
    points: z.array(counts.extend({ date: isoDay })),
  })
  .openapi("ReleaseProgressHistory");
