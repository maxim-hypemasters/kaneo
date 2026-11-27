import { z } from "../openapi";
import { SUGGESTED_PRIORITIES } from "./agent-types";
import { isRecord } from "./is-record";

export const REASON_MAX_CHARS = 200;

const questionInput = z.object({
  text: z.string().trim().min(1).max(500),
  options: z
    .array(z.string().trim().min(1).max(200))
    .max(4)
    .openapi({ description: "Answer options, the recommended one first" }),
  blocking: z.boolean().openapi({
    description: "True when the agent cannot do the work without the answer",
  }),
});

const id = z.string().trim().min(1).max(100);
const reason = z.string().trim().min(1).max(REASON_MAX_CHARS);

/**
 * One schema per field the agent may fill in, keyed as the model sends them.
 * Each key is checked on its own, so one bad pick drops only itself.
 */
export const recommendationSchemas = {
  assignee: z.object({ userId: id, reason }),
  priority: z.object({ priority: z.enum(SUGGESTED_PRIORITIES), reason }),
  feature: z.object({ featureId: id, milestoneId: id.nullish(), reason }),
  milestone: z.object({ milestoneId: id, reason }),
  release: z.object({ releaseId: id, reason }),
  estimate: z.object({
    minutes: z
      .number()
      .int()
      .positive()
      .max(120_000)
      .openapi({ description: "Working effort in minutes" }),
    reason,
  }),
  testCases: z.object({
    cases: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(255),
          steps: z.string().trim().max(10_000).nullish(),
          expectedResult: z.string().trim().max(10_000).nullish(),
        }),
      )
      .min(1)
      .max(5),
    reason: reason.optional(),
  }),
};

export type RecommendationKey = keyof typeof recommendationSchemas;
export type Recommendations = {
  [K in RecommendationKey]?: z.infer<(typeof recommendationSchemas)[K]>;
};

const assessmentFields = {
  score: z.number().int().min(0).max(100),
  questions: z.array(questionInput).max(8),
  suggestions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        markdown: z.string().trim().min(1).max(4000),
      }),
    )
    .max(5),
};

/**
 * What a runner reports for an assessment; Kaneo assigns ids and the verdict.
 * Unknown keys are stripped, so a runner that still sends the retired summary
 * and checklist passes. Recommendations are read key by key after this; any
 * value that is not an object, such as [] or "none", counts as none.
 */
export const assessmentResultSchema = z
  .object({
    ...assessmentFields,
    recommendations: z
      .preprocess(
        (value) => (isRecord(value) ? value : undefined),
        z.record(z.string(), z.unknown()).optional(),
      )
      .optional()
      .openapi({
        description:
          "Values for the task's empty fields, as described by the resultSchema of the claim. Each key is validated on its own; an invalid one is dropped, never refused. A value that is not an object counts as no recommendations.",
      }),
  })
  .openapi("AgentAssessmentResult");

export type AssessmentResult = z.infer<typeof assessmentResultSchema>;

export const runnerQuestionsSchema = z.array(questionInput).max(8);

// What the model is asked for: every recommendation spelled out, strictly.
const modelAssessmentSchema = z.object({
  ...assessmentFields,
  recommendations: z
    .object({
      assignee: recommendationSchemas.assignee.optional(),
      priority: recommendationSchemas.priority.optional(),
      feature: recommendationSchemas.feature.optional(),
      milestone: recommendationSchemas.milestone.optional(),
      release: recommendationSchemas.release.optional(),
      estimate: recommendationSchemas.estimate.optional(),
      testCases: recommendationSchemas.testCases.optional(),
    })
    .optional(),
});

/** The JSON Schema a runner hands the model so its answer validates here. */
export function assessmentJsonSchema() {
  return z.toJSONSchema(modelAssessmentSchema) as Record<string, unknown>;
}
