import { assertAuthorizedProjectSnapshot } from "./access-scope";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { columnTable, milestoneTable, taskTable } from "../database/schema";
import { boundedTaskRead } from "../task/bounded-read";
import { milestoneProgress } from "./progress";

export async function readProjectMilestones(
  projectId: string,
  page = 1,
  limit = 50,
  expectedWorkspaceId?: string,
) {
  return boundedTaskRead(async (tx) => {
    await assertAuthorizedProjectSnapshot(tx, projectId, expectedWorkspaceId);
    const where = and(
      eq(taskTable.projectId, projectId),
      eq(taskTable.type, "feature"),
    );
    const [totals] = await tx
      .select({ total: count() })
      .from(milestoneTable)
      .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
      .where(where);
    const total = totals?.total ?? 0;
    const rows = await tx
      .select({ milestone: milestoneTable, featureTitle: taskTable.title })
      .from(milestoneTable)
      .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
      .where(where)
      .orderBy(
        asc(taskTable.title),
        asc(taskTable.id),
        asc(milestoneTable.position),
        asc(milestoneTable.id),
      )
      .limit(limit)
      .offset((page - 1) * limit);
    const columns = await tx
      .select()
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId));
    const statuses = rows.length
      ? await tx
          .select({
            milestoneId: taskTable.milestoneId,
            status: taskTable.status,
            count: count(),
          })
          .from(taskTable)
          .where(
            and(
              eq(taskTable.projectId, projectId),
              inArray(taskTable.type, ["task", "bug"]),
              inArray(
                taskTable.milestoneId,
                rows.map((row) => row.milestone.id),
              ),
            ),
          )
          .groupBy(taskTable.milestoneId, taskTable.status)
      : [];
    return {
      data: rows.map(({ milestone, featureTitle }) => ({
        ...milestone,
        projectId,
        featureTitle,
        progress: milestoneProgress(
          statuses
            .filter((row) => row.milestoneId === milestone.id)
            .map((row) => ({ ...row, status: row.status ?? "" })),
          columns,
        ),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }, "Milestones request took too long; retry later");
}
