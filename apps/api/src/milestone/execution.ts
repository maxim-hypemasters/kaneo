import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { milestoneTable, taskTable } from "../database/schema";
import { progressDay } from "../release/progress/progress-day";
import type { MilestoneTransaction } from "./membership";
import {
  milestoneStatus,
  milestoneWorkIsActive,
  milestoneWorkIsCompleted,
} from "./completion";

export type MilestoneExecution = {
  startDate: string | null;
  endDate: string | null;
  status: "to-do" | "in-progress" | "done";
  columnId: null;
};

export async function readMilestoneExecution(
  database: Pick<MilestoneTransaction, "select">,
  projectId: string,
  milestoneIds: readonly string[],
  timeZone = "UTC",
): Promise<Map<string, MilestoneExecution>> {
  if (!milestoneIds.length) return new Map();
  // PostgreSQL LEAST/GREATEST use the nonnull date when only one is set.
  // Normalizing each interval also covers reversed ranges from old imports.
  // Decode PostgreSQL's timestamp text as ISO UTC explicitly: generic Date
  // parsing of space-separated timestamps can reinterpret years below 100.
  const timestamp = (value: string) => new Date(`${value.replace(" ", "T")}Z`);
  const rows = await database
    .select({
      milestoneId: taskTable.milestoneId,
      total: count(),
      completed:
        sql<number>`count(*) filter (where ${milestoneWorkIsCompleted(taskTable)})`.mapWith(
          Number,
        ),
      active:
        sql<number>`count(*) filter (where ${milestoneWorkIsActive(taskTable)})`.mapWith(
          Number,
        ),
      startDate:
        sql<Date | null>`min(least(${taskTable.startDate}, ${taskTable.dueDate}))::text`.mapWith(
          timestamp,
        ),
      endDate:
        sql<Date | null>`max(greatest(${taskTable.startDate}, ${taskTable.dueDate}))::text`.mapWith(
          timestamp,
        ),
    })
    .from(taskTable)
    .innerJoin(
      milestoneTable,
      and(
        eq(milestoneTable.id, taskTable.milestoneId),
        eq(milestoneTable.featureId, taskTable.featureId),
      ),
    )
    .where(
      and(
        eq(taskTable.projectId, projectId),
        inArray(taskTable.milestoneId, milestoneIds),
        inArray(taskTable.type, ["task", "bug"]),
        ne(taskTable.status, "archived"),
      ),
    )
    .groupBy(taskTable.milestoneId);

  return new Map(
    rows.flatMap((row) =>
      row.milestoneId
        ? [
            [
              row.milestoneId,
              {
                status: milestoneStatus(row.total, row.completed, row.active),
                columnId: null,
                startDate: row.startDate
                  ? progressDay(row.startDate, timeZone)
                  : null,
                endDate: row.endDate
                  ? progressDay(row.endDate, timeZone)
                  : null,
              },
            ] as const,
          ]
        : [],
    ),
  );
}
