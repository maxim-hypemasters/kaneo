import { z } from "../../openapi";

const authorSchema = z.object({
  name: z.string().max(255).nullable(),
  avatar: z.string().max(2_048).nullable().optional(),
});

export const transferFeatureDocumentSchema = z.object({
  key: z.string().min(1),
  featureKey: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  body: z.string().max(1_000_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: authorSchema,
  updatedBy: authorSchema,
});

export const transferFeatureUpdateSchema = z.object({
  key: z.string().min(1),
  featureKey: z.string().min(1),
  note: z.string().trim().min(1).max(100_000),
  health: z.enum(["on-track", "at-risk", "off-track"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  author: authorSchema,
  milestones: z.array(
    z.object({
      key: z.string().min(1),
      title: z.string().min(1).max(255),
      position: z.number().int().min(0),
      total: z.number().int().nonnegative(),
      started: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      previousTotal: z.number().int().nonnegative().nullable(),
      previousCompleted: z.number().int().nonnegative().nullable(),
    }),
  ),
});

export type TransferFeatureDocument = z.infer<
  typeof transferFeatureDocumentSchema
>;
export type TransferFeatureUpdate = z.infer<typeof transferFeatureUpdateSchema>;
