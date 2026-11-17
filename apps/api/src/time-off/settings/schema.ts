import { z } from "../../openapi";
import { isoDay } from "../../release/release-dates";

const DEADLINE =
  "The last day, inclusive, on which a member's first public holiday calendar choice applies without approval. It is a UTC day. Null means no deadline, so a first choice is always free.";

export const timeOffSettingsSchema = z
  .object({
    workspaceId: z.string(),
    holidayCalendarDeadline: z
      .string()
      .nullable()
      .openapi({ format: "date", description: DEADLINE }),
  })
  .openapi("TimeOffSettings");

export const setTimeOffSettingsBody = z
  .object({
    holidayCalendarDeadline: isoDay
      .nullable()
      .openapi({ description: `${DEADLINE} Send null to clear it.` }),
  })
  .strict();

export type TimeOffSettingsInput = z.infer<typeof setTimeOffSettingsBody>;
