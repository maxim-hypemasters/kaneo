import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  columnTable,
  projectTable,
  releaseTable,
  taskTable,
  userTable,
} from "../database/schema";
import { escapeLikePattern } from "../search/like-pattern";
import { boundedTaskRead } from "../task/bounded-read";
import type { z } from "../openapi";
import { featureOwner, pagination } from "./access";
import type { FeatureScope, issuesQuery } from "./schema";

export async function readFeatureIssues(
  scope: FeatureScope,
  options: z.infer<typeof issuesQuery>,
) {
  return boundedTaskRead(async (tx) => {
    await featureOwner(tx, scope);
    const [project] = await tx
      .select({ slug: projectTable.slug })
      .from(projectTable)
      .where(eq(projectTable.id, scope.projectId));
    const pattern = options.search
      ? `%${escapeLikePattern(options.search)}%`
      : null;
    const where = and(
      eq(taskTable.projectId, scope.projectId),
      eq(taskTable.featureId, scope.featureId),
      inArray(taskTable.type, ["task", "bug"]),
      options.archived === "exclude"
        ? ne(taskTable.status, "archived")
        : options.archived === "only"
          ? eq(taskTable.status, "archived")
          : undefined,
      options.milestoneId === "none"
        ? isNull(taskTable.milestoneId)
        : options.milestoneId
          ? eq(taskTable.milestoneId, options.milestoneId)
          : undefined,
      pattern
        ? or(
            ilike(taskTable.title, pattern),
            ilike(
              sql`${project!.slug} || '-' || ${taskTable.number}::text`,
              pattern,
            ),
          )
        : undefined,
    );
    const totals = await tx
      .select({ status: taskTable.status, total: count() })
      .from(taskTable)
      .where(where)
      .groupBy(taskTable.status);
    const columns = await tx
      .select({
        id: columnTable.id,
        slug: columnTable.slug,
        name: columnTable.name,
        position: columnTable.position,
        isFinal: columnTable.isFinal,
      })
      .from(columnTable)
      .where(eq(columnTable.projectId, scope.projectId))
      .orderBy(asc(columnTable.position), asc(columnTable.id));
    const groups = columns.map((column) => ({
      ...column,
      total: totals.find((row) => row.status === column.slug)?.total ?? 0,
    }));
    for (const total of totals)
      if (total.status && !groups.some((group) => group.slug === total.status))
        groups.push({
          id: total.status,
          slug: total.status,
          name: total.status,
          position: total.status === "planned" ? -1 : Number.MAX_SAFE_INTEGER,
          isFinal: false,
          total: total.total,
        });
    groups.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    const rows = await tx
      .select({
        id: taskTable.id,
        projectId: taskTable.projectId,
        title: taskTable.title,
        createdAt: taskTable.createdAt,
        updatedAt: taskTable.updatedAt,
        type: sql<"task" | "bug">`${taskTable.type}`,
        number: taskTable.number,
        position: taskTable.position,
        status: sql<string>`${taskTable.status}`,
        priority: sql<string>`${taskTable.priority}`,
        userId: taskTable.userId,
        assignee: {
          id: userTable.id,
          name: userTable.name,
          image: userTable.image,
        },
        featureId: sql<string>`${taskTable.featureId}`,
        milestoneId: taskTable.milestoneId,
        releaseId: taskTable.releaseId,
        releaseName: releaseTable.name,
        estimateSeconds: taskTable.estimateSeconds,
        startDate: taskTable.startDate,
        dueDate: taskTable.dueDate,
        archivedAt: taskTable.archivedAt,
        columnId: taskTable.columnId,
      })
      .from(taskTable)
      .leftJoin(
        columnTable,
        and(
          eq(columnTable.id, taskTable.columnId),
          eq(columnTable.projectId, scope.projectId),
        ),
      )
      .leftJoin(userTable, eq(userTable.id, taskTable.userId))
      .leftJoin(
        releaseTable,
        and(
          eq(releaseTable.id, taskTable.releaseId),
          eq(releaseTable.projectId, scope.projectId),
        ),
      )
      .where(where)
      .orderBy(
        sql`case when ${taskTable.status} = 'planned' then -1 else coalesce(${columnTable.position}, 2147483647) end`,
        asc(taskTable.position),
        asc(taskTable.id),
      )
      .limit(options.limit)
      .offset((options.page - 1) * options.limit);
    return {
      data: rows.map((row) => ({
        ...row,
        projectSlug: project!.slug,
        descriptionDeferred: true as const,
      })),
      groups,
      pagination: pagination(
        totals.reduce((sum, row) => sum + row.total, 0),
        options,
      ),
    };
  }, "Feature issues request took too long; retry later");
}
