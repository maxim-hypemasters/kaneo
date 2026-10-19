import { z } from "../../openapi";
import { isoDay } from "../../release/release-dates";
import { milestoneDatesAreOrdered } from "../../milestone/dates";

const transferMilestoneFields = z.object({
  key: z.string().min(1),
  featureKey: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(10_000).nullable().optional(),
  startDate: isoDay.nullable().optional(),
  endDate: isoDay.nullable().optional(),
  targetDate: isoDay.nullable().optional().openapi({
    deprecated: true,
    description: "Legacy end date. Used only when endDate is omitted.",
  }),
  position: z.number().int().min(0).max(2_147_483_646),
});
export const transferMilestoneSchema = transferMilestoneFields.refine(
  (milestone) =>
    milestoneDatesAreOrdered({
      startDate: milestone.startDate,
      endDate:
        milestone.endDate === undefined
          ? milestone.targetDate
          : milestone.endDate,
    }),
  {
    message: "Milestone start date must be on or before end date",
    path: ["endDate"],
  },
);

export const exportedMilestoneSchema = transferMilestoneFields
  .omit({ targetDate: true })
  .extend({
    startDate: isoDay.nullable(),
    endDate: isoDay.nullable(),
  });
