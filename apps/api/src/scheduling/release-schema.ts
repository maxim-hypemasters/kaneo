import { z } from "../openapi";
import { isoDay } from "../release/release-dates";
import { estimateSecondsSchema } from "../task/estimate";
import { VALID_PRIORITIES } from "../task/validate-task-fields";
import { releasePlanChangesSchema } from "./release-changes-schema";
import {
  applyBody,
  planningTimeZone,
  scheduleParam,
  schedulePreviewSchema,
  scheduleReadSchema,
  scheduleWorkSchema,
} from "./schema";

export const releaseScheduleParam = scheduleParam.extend({
  releaseId: z.string().min(1),
});
export const releasePlanningQuery = z.object({
  timeZone: planningTimeZone.optional(),
});
export const releasePreviewBody = z
  .object({
    timeZone: planningTimeZone.optional(),
    changes: releasePlanChangesSchema.optional(),
  })
  .strict();
export const releaseApplyBody = applyBody
  .omit({ planFrom: true })
  .extend({
    timeZone: planningTimeZone,
    changes: releasePlanChangesSchema.optional(),
  })
  .strict();
export const releaseTaskPrioritySchema = z.enum(VALID_PRIORITIES);
const releaseWorkSchema = scheduleWorkSchema.extend({
  changed: z.boolean(),
  completed: z.boolean(),
  title: z.string(),
  number: z.number().nullable(),
  identifier: z.string().nullable(),
  type: z.enum(["task", "bug"]),
  assigneeName: z.string().nullable(),
  currentAssigneeId: z.string().nullable(),
  currentAssigneeName: z.string().nullable(),
  estimateSeconds: estimateSecondsSchema,
  priority: releaseTaskPrioritySchema,
  currentStart: z.string().nullable(),
  currentEnd: z.string().nullable(),
  featureId: z.string().nullable(),
  featureTitle: z.string().nullable(),
  milestoneId: z.string().nullable(),
  milestoneTitle: z.string().nullable(),
  milestonePosition: z.number().nullable(),
  milestoneReleaseId: z.string().nullable(),
});
export const releaseScheduleReadSchema = scheduleReadSchema.extend({
  timeZone: planningTimeZone,
  releaseId: z.string(),
  planned: z.boolean(),
  inputRevision: z.string(),
  tasks: z.array(releaseWorkSchema),
});
export const releaseSchedulePreviewSchema = schedulePreviewSchema.extend({
  changes: releasePlanChangesSchema,
  releaseId: z.string(),
  releaseDates: z.object({
    startDate: isoDay,
    codeFreezeDate: isoDay,
    submissionDate: isoDay,
  }),
  timeZone: planningTimeZone,
  tasks: z.array(releaseWorkSchema),
  dependencies: z.array(
    z.object({ blockerId: z.string(), blockedId: z.string() }),
  ),
});
