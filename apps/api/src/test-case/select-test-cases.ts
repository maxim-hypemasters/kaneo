import { and, asc, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import { milestoneTable, taskTable, testCaseTable } from "../database/schema";
import type { TaskReadDatabase } from "../task/bounded-read";
import type { TestCaseListQuery, TestCaseReadAccess } from "./schema";
import { TEST_CASE_STATUSES, type TestCaseStatus } from "./test-case-status";

type Database = Pick<TaskReadDatabase, "select">;

export const linkedBug = alias(taskTable, "test_case_bug");
export const linkedFeature = alias(taskTable, "test_case_feature");

export const summaryColumns = {
  id: testCaseTable.id,
  projectId: testCaseTable.projectId,
  title: testCaseTable.title,
  status: testCaseTable.status,
  milestoneId: testCaseTable.milestoneId,
  bugId: testCaseTable.bugId,
  createdBy: testCaseTable.createdBy,
  createdAt: testCaseTable.createdAt,
  updatedAt: testCaseTable.updatedAt,
  milestoneTitle: milestoneTable.title,
  milestoneReleaseId: milestoneTable.releaseId,
  featureId: linkedFeature.id,
  featureTitle: linkedFeature.title,
  bugNumber: linkedBug.number,
  bugTitle: linkedBug.title,
  bugType: linkedBug.type,
  bugStatus: linkedBug.status,
  bugReleaseId: linkedBug.releaseId,
};

// Each test case joins to its milestone, that milestone's Feature and its
// bug. The joins also require the same project, so a stale link never shows
// another project's data.
export const milestoneJoin = eq(milestoneTable.id, testCaseTable.milestoneId);
export const featureJoin = and(
  eq(linkedFeature.id, milestoneTable.featureId),
  eq(linkedFeature.projectId, testCaseTable.projectId),
);
export const bugJoin = and(
  eq(linkedBug.id, testCaseTable.bugId),
  eq(linkedBug.projectId, testCaseTable.projectId),
);

type SummaryRow = {
  id: string;
  projectId: string;
  title: string;
  status: TestCaseStatus;
  milestoneId: string | null;
  bugId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  milestoneTitle: string | null;
  milestoneReleaseId: string | null;
  featureId: string | null;
  featureTitle: string | null;
  bugNumber: number | null;
  bugTitle: string | null;
  bugType: (typeof taskTable.$inferSelect)["type"] | null;
  bugStatus: string | null;
  bugReleaseId: string | null;
};

export function toTestCaseSummary(row: SummaryRow, access: TestCaseReadAccess) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    milestoneId: row.milestoneId,
    bugId: row.bugId,
    milestone:
      access.milestones &&
      row.milestoneId &&
      row.milestoneTitle !== null &&
      row.featureId !== null &&
      row.featureTitle !== null
        ? {
            id: row.milestoneId,
            title: row.milestoneTitle,
            featureId: row.featureId,
            featureTitle: row.featureTitle,
            releaseId: row.milestoneReleaseId,
          }
        : null,
    bug:
      access.bugs && row.bugId && row.bugTitle !== null && row.bugType !== null
        ? {
            id: row.bugId,
            number: row.bugNumber,
            title: row.bugTitle,
            type: row.bugType,
            status: row.bugStatus,
            releaseId: row.bugReleaseId,
          }
        : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function linkFilter(column: AnyPgColumn, value?: string) {
  if (!value) return undefined;
  return value === "none" ? isNull(column) : eq(column, value);
}

// One page of test cases matching `scope` and the query's filters, with
// counts per status (ignoring the status filter, so status chips stay useful).
export async function listTestCases(
  database: Database,
  {
    scope,
    query,
    access,
    orderBy = [asc(testCaseTable.createdAt), asc(testCaseTable.id)],
  }: {
    scope: SQL | undefined;
    query: TestCaseListQuery;
    access: TestCaseReadAccess;
    orderBy?: SQL[];
  },
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const filters = and(
    scope,
    query.search
      ? ilike(
          testCaseTable.title,
          `%${query.search.replace(/[\\%_]/g, "\\$&")}%`,
        )
      : undefined,
    linkFilter(testCaseTable.milestoneId, query.milestoneId),
    linkFilter(testCaseTable.bugId, query.bugId),
  );

  const counts = await database
    .select({ status: testCaseTable.status, count: count() })
    .from(testCaseTable)
    .leftJoin(milestoneTable, milestoneJoin)
    .leftJoin(linkedFeature, featureJoin)
    .leftJoin(linkedBug, bugJoin)
    .where(filters)
    .groupBy(testCaseTable.status);
  const statusCounts = Object.fromEntries(
    TEST_CASE_STATUSES.map((status) => [status, 0]),
  ) as Record<TestCaseStatus, number>;
  for (const row of counts) statusCounts[row.status] = row.count;
  const total = query.status
    ? statusCounts[query.status]
    : Object.values(statusCounts).reduce((sum, value) => sum + value, 0);

  const rows = await database
    .select(summaryColumns)
    .from(testCaseTable)
    .leftJoin(milestoneTable, milestoneJoin)
    .leftJoin(linkedFeature, featureJoin)
    .leftJoin(linkedBug, bugJoin)
    .where(
      and(
        filters,
        query.status ? eq(testCaseTable.status, query.status) : undefined,
      ),
    )
    .orderBy(...orderBy)
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    data: rows.map((row) => toTestCaseSummary(row, access)),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    statusCounts,
  };
}
