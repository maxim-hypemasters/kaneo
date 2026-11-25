import { pagingNumber, responseTimestamp, z } from "../openapi";
import { TASK_TYPES } from "../task/task-type";
import { TEST_CASE_STATUSES } from "./test-case-status";

export const projectParams = z.object({ projectId: z.string().min(1) });
export const featureParams = z.object({ featureId: z.string().min(1) });
export const releaseParams = z.object({ releaseId: z.string().min(1) });
export const testCaseParams = z.object({ id: z.string().min(1) });

const status = z.enum(TEST_CASE_STATUSES).openapi({
  description:
    "Latest result of running the test case: not_run, passed, failed or blocked.",
});
const longText = z.string().max(10_000).nullable();
const linkFilter = (target: string) =>
  z
    .string()
    .min(1)
    .optional()
    .openapi({
      description: `Only test cases linked to this ${target}, or "none" for test cases without one.`,
    });

const fields = {
  title: z.string().trim().min(1).max(255),
  description: longText.optional().openapi({
    description: "Preconditions and context.",
  }),
  steps: longText.optional(),
  expectedResult: longText.optional(),
  status: status.optional(),
  milestoneId: z.string().min(1).nullable().optional().openapi({
    description:
      "Milestone in the same project this test case verifies. Needs milestone:read. Null unlinks it.",
  }),
  bugId: z.string().min(1).nullable().optional().openapi({
    description:
      "Bug in the same project this test case verifies. Needs bug:read. Null unlinks it.",
  }),
};

export const createTestCaseBody = z.object(fields).strict();

export const updateTestCaseBody = z
  .object({ ...fields, title: fields.title.optional() })
  .strict()
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    "At least one field is required",
  );

export const testCaseListQuery = z.object({
  search: z.string().trim().max(255).optional(),
  status: status.optional(),
  milestoneId: linkFilter("milestone"),
  bugId: linkFilter("bug"),
  page: pagingNumber(1, 1_000_000).optional(),
  limit: pagingNumber(1, 100).optional(),
});

const milestoneSummary = z.object({
  id: z.string(),
  title: z.string(),
  featureId: z.string(),
  featureTitle: z.string(),
  releaseId: z.string().nullable(),
});

const bugSummary = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  title: z.string(),
  type: z.enum(TASK_TYPES).openapi({
    description: "A linked Bug converted to a Task keeps its link.",
  }),
  status: z.string().nullable(),
  releaseId: z.string().nullable(),
});

export const testCaseSummarySchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    title: z.string(),
    status,
    milestoneId: z.string().nullable(),
    bugId: z.string().nullable(),
    milestone: milestoneSummary.nullable().openapi({
      description: "Null without a link or without milestone:read.",
    }),
    bug: bugSummary.nullable().openapi({
      description: "Null without a link or without bug:read.",
    }),
    createdBy: z.string().nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("TestCaseSummary");

export const testCaseSchema = testCaseSummarySchema
  .extend({
    description: z.string().nullable(),
    steps: z.string().nullable(),
    expectedResult: z.string().nullable(),
  })
  .openapi("TestCase");

export const testCaseListSchema = z
  .object({
    data: z.array(testCaseSummarySchema),
    pagination: z.object({
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
    statusCounts: z
      .object({
        not_run: z.number(),
        passed: z.number(),
        failed: z.number(),
        blocked: z.number(),
      })
      .openapi({
        description:
          "Matching test cases per status, counted with every filter except status.",
      }),
  })
  .openapi("TestCaseList");

export const deletedTestCaseSchema = z.object({ id: z.string() });

export type TestCaseListQuery = z.infer<typeof testCaseListQuery>;

export type TestCaseScope = {
  projectId: string;
  workspaceId: string;
  userId: string;
};

// Whether the caller may see the linked milestone's and bug's details.
export type TestCaseReadAccess = { milestones: boolean; bugs: boolean };
