import { milestoneDatesAreOrdered } from "./dates";
import { isoDay } from "../release/release-dates";
import { responseTimestamp, z } from "../openapi";

export const milestoneParam = z.object({ id: z.string().min(1) });
export const featureParam = z.object({ featureId: z.string().min(1) });
const title = z.string().trim().min(1).max(255);
const description = z.string().max(10_000).nullable();
const calendarDate = isoDay.nullable();
export const createMilestoneBody = z
  .object({
    title,
    description: description.optional(),
    startDate: calendarDate.optional(),
    endDate: calendarDate.optional(),
    taskIds: z.array(z.string().min(1)).optional().openapi({
      description:
        "Existing Task/Bug ids in this Feature to assign atomically. Existing milestone membership is replaced.",
    }),
  })
  .refine(milestoneDatesAreOrdered, {
    message: "Milestone start date must be on or before end date",
    path: ["endDate"],
  })
  .refine(
    (body) =>
      !body.taskIds || new Set(body.taskIds).size === body.taskIds.length,
    { message: "Task ids must be unique", path: ["taskIds"] },
  );
export const updateMilestoneBody = z
  .object({
    title: title.optional(),
    description: description.optional(),
    startDate: calendarDate.optional(),
    endDate: calendarDate.optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    "At least one field is required",
  )
  .refine(milestoneDatesAreOrdered, {
    message: "Milestone start date must be on or before end date",
    path: ["endDate"],
  });
export const reorderMilestonesBody = z.object({
  milestoneIds: z.array(z.string().min(1)),
});
export const milestoneSchema = z
  .object({
    id: z.string(),
    featureId: z.string(),
    title: z.string(),
    description,
    startDate: calendarDate,
    endDate: calendarDate,
    position: z.number().int(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
    progress: z.object({
      total: z.number().int(),
      started: z.number().int(),
      completed: z.number().int(),
    }),
  })
  .openapi("Milestone");
