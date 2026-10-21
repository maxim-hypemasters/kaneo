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
import { HTTPException } from "hono/http-exception";
import { projectTable, releaseTable, taskTable } from "../../database/schema";
import { escapeLikePattern } from "../../search/like-pattern";
import { boundedTaskRead } from "../bounded-read";
import type { FeatureLinkCandidatesQuery } from "../feature-link-candidates-schema";

export async function readFeatureLinkCandidates(
  projectId: string,
  expectedWorkspaceId: string,
  options: FeatureLinkCandidatesQuery,
) {
  return boundedTaskRead(async (tx) => {
    const [project] = await tx
      .select({
        workspaceId: projectTable.workspaceId,
        slug: projectTable.slug,
      })
      .from(projectTable)
      .where(eq(projectTable.id, projectId));
    if (!project)
      throw new HTTPException(404, { message: "Project not found" });
    if (project.workspaceId !== expectedWorkspaceId)
      throw new HTTPException(409, {
        message: "Project changed workspaces; retry the request",
      });
    const pattern = options.q ? `%${escapeLikePattern(options.q)}%` : null;
    const where = and(
      eq(taskTable.projectId, projectId),
      inArray(taskTable.type, ["task", "bug"]),
      ne(taskTable.status, "archived"),
      isNull(taskTable.featureId),
      pattern
        ? or(
            ilike(taskTable.title, pattern),
            ilike(
              sql<string>`${project.slug} || '-' || ${taskTable.number}::text`,
              pattern,
            ),
          )
        : undefined,
    );
    const [totals] = await tx
      .select({ total: count() })
      .from(taskTable)
      .where(where);
    const rows = await tx
      .select({
        id: taskTable.id,
        title: taskTable.title,
        type: sql<"task" | "bug">`${taskTable.type}`,
        number: taskTable.number,
        releaseId: releaseTable.id,
        releaseName: releaseTable.name,
      })
      .from(taskTable)
      .leftJoin(
        releaseTable,
        and(
          eq(releaseTable.id, taskTable.releaseId),
          eq(releaseTable.projectId, projectId),
        ),
      )
      .where(where)
      .orderBy(asc(taskTable.number), asc(taskTable.id))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit);
    const total = totals?.total ?? 0;
    return {
      data: rows.map((row) => ({ ...row, projectSlug: project.slug })),
      pagination: {
        total,
        page: options.page,
        limit: options.limit,
        totalPages: Math.ceil(total / options.limit),
      },
    };
  }, "Feature link candidates request took too long; retry later");
}
