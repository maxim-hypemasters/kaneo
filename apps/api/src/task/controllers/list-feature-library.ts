import { assertAuthorizedProjectSnapshot } from "../../milestone/access-scope";
import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import {
  labelTable,
  milestoneTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { z } from "../../openapi";
import { boundedTaskRead } from "../bounded-read";
import { boardDescription, descriptionDeferred } from "../description-pages";
import { featureLibraryQuery } from "../feature-library-schema";

export async function listFeatureLibrary(
  projectId: string,
  options: z.infer<typeof featureLibraryQuery>,
  expectedWorkspaceId?: string,
) {
  const page = options.page ?? 1,
    limit = options.limit ?? 50;
  return boundedTaskRead(async (tx) => {
    await assertAuthorizedProjectSnapshot(tx, projectId, expectedWorkspaceId);
    const where = and(
      eq(taskTable.projectId, projectId),
      eq(taskTable.type, "feature"),
      options.archived === "true"
        ? isNotNull(taskTable.archivedAt)
        : isNull(taskTable.archivedAt),
      options.search
        ? ilike(
            taskTable.title,
            `%${options.search.replace(/[\\%_]/g, "\\$&")}%`,
          )
        : undefined,
    );
    const [totals] = await tx
      .select({ total: count() })
      .from(taskTable)
      .where(where);
    const total = totals?.total ?? 0;
    const rows = await tx
      .select({
        ...getTableColumns(taskTable),
        description: boardDescription,
        descriptionDeferred,
        milestoneCount:
          sql<number>`(select count(*) from ${milestoneTable} where ${milestoneTable.featureId} = ${taskTable.id})`.mapWith(
            Number,
          ),
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
      .where(where)
      .orderBy(asc(taskTable.title), asc(taskTable.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const labels = rows.length
      ? await tx
          .select({
            id: labelTable.id,
            taskId: labelTable.taskId,
            name: labelTable.name,
            color: labelTable.color,
          })
          .from(labelTable)
          .where(
            and(
              inArray(
                labelTable.taskId,
                rows.map((row) => row.id),
              ),
              eq(
                labelTable.workspaceId,
                tx
                  .select({ workspaceId: projectTable.workspaceId })
                  .from(projectTable)
                  .where(eq(projectTable.id, projectId)),
              ),
              isNull(labelTable.deletionStartedAt),
            ),
          )
      : [];
    return {
      data: rows.map((row) => ({
        ...row,
        type: "feature" as const,
        status: null,
        priority: null,
        userId: null,
        startDate: null,
        dueDate: null,
        releaseId: null,
        featureId: null,
        milestoneId: null,
        assigneeName: null,
        assigneeId: null,
        assigneeImage: null,
        columnId: null,
        labels: labels
          .filter((label) => label.taskId === row.id)
          .map(({ taskId: _, ...label }) => label),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }, "Feature library request took too long; retry later");
}
