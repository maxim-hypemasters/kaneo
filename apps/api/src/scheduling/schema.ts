import { z } from "../openapi";

export const planningTimeZone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Expected an IANA time zone");
export const scheduleParam = z.object({ projectId: z.string().min(1) });
export const planningSettingsBody = z
  .object({
    timeZone: planningTimeZone,
    estimateDayMinutes: z.number().int().min(1).max(1440),
  })
  .strict();
export const scheduleSegmentSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});
export const scheduleWorkSchema = z.object({
  taskId: z.string(),
  assigneeId: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  segments: z.array(scheduleSegmentSchema),
  reason: z.string().nullable(),
});
export const scheduleReadSchema = z.object({
  generation: z.number(),
  appliedAt: z.string().nullable(),
  revision: z.string(),
  outdated: z.boolean(),
  legacy: z.boolean(),
  settings: z.object({
    timeZone: z.string().nullable(),
    estimateDayMinutes: z.number(),
  }),
  tasks: z.array(scheduleWorkSchema),
});
export const planningSettingsSchema = z.object({
  timeZone: z.string().nullable(),
  estimateDayMinutes: z.number(),
});
export const previewBody = z
  .object({ planFrom: z.string().datetime().optional() })
  .strict();
export const applyBody = z
  .object({
    asOf: z.string().datetime(),
    planFrom: z.string().datetime(),
    revision: z.string().length(64),
    generation: z.number().int().min(0),
  })
  .strict();
export const schedulePreviewSchema = z.object({
  asOf: z.string(),
  expiresAt: z.string().datetime(),
  planFrom: z.string(),
  revision: z.string(),
  inputRevision: z.string(),
  generation: z.number(),
  tasks: z.array(scheduleWorkSchema),
  diagnostics: z.array(z.object({ taskId: z.string(), reason: z.string() })),
  warnings: z.array(z.object({ taskId: z.string(), reason: z.string() })),
  changedCount: z.number(),
  scheduledCount: z.number(),
  unscheduledCount: z.number(),
});
const interval = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine(
    (v) => v.startMinute < v.endMinute,
    "Working interval must end after it starts",
  );
export const workCalendarBody = z
  .object({
    timeZone: planningTimeZone,
    weeklyIntervals: z
      .array(interval)
      .min(1)
      .max(70)
      .refine((items) => {
        const sorted = [...items].sort(
          (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
        );
        return sorted.every((item, index) => {
          const previous = sorted[index - 1];
          return (
            !previous ||
            item.weekday !== previous.weekday ||
            item.startMinute >= previous.endMinute
          );
        });
      }, "Working intervals cannot overlap"),
    timeOff: z
      .array(
        scheduleSegmentSchema.refine(
          (v) => Date.parse(v.start) < Date.parse(v.end),
          "Time off must end after it starts",
        ),
      )
      .max(500),
  })
  .strict();
export const calendarParam = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
});
export const workCalendarSchema = z.object({
  userId: z.string(),
  timeZone: z.string(),
  weeklyIntervals: z.array(interval),
  timeOff: z.array(scheduleSegmentSchema),
});
