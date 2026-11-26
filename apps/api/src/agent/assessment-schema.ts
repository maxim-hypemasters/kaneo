import { z } from "../openapi";
import { CHECKLIST_STATUSES } from "./agent-types";

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

/** What a runner reports for an assessment; Kaneo assigns ids and the verdict. */
export const assessmentResultSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    summary: z.string().trim().max(2000),
    checklist: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(60),
          label: z.string().trim().min(1).max(120),
          status: z.enum(CHECKLIST_STATUSES),
          note: z.string().trim().max(500).optional(),
        }),
      )
      .max(12),
    questions: z.array(questionInput).max(8),
    suggestions: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(120),
          markdown: z.string().trim().min(1).max(4000),
        }),
      )
      .max(5),
  })
  .openapi("AgentAssessmentResult");

export type AssessmentResult = z.infer<typeof assessmentResultSchema>;

export const runnerQuestionsSchema = z.array(questionInput).max(8);

/** The JSON Schema a runner hands the model so its answer validates here. */
export function assessmentJsonSchema() {
  return z.toJSONSchema(assessmentResultSchema) as Record<string, unknown>;
}
