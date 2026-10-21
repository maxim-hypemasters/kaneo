import { z } from "../../openapi";
import { isoDay } from "../../release/release-dates";
import { milestoneDatesAreOrdered } from "../../milestone/dates";

export const planningSnapshotSchema = z.object({
  projectId: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  status: z.string().nullable().optional(),
  columnId: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  releaseId: z.string().nullable().optional(),
  releaseName: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
});

export const transferReleaseSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().trim().min(1).max(255),
    startDate: isoDay,
    codeFreezeDate: isoDay,
    submissionDate: isoDay,
  })
  .refine(
    (value) =>
      value.startDate <= value.codeFreezeDate &&
      value.codeFreezeDate <= value.submissionDate,
    { message: "Invalid release date order" },
  );

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
  leadId: z.string().nullable().optional(),
  status: z.string().optional().openapi({
    description:
      "Informational derived status on export. Accepted as legacy import metadata and ignored; linked Tasks/Bugs determine milestone status.",
  }),
  priority: z.string().optional(),
  releaseKey: z.string().nullable().optional(),
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
