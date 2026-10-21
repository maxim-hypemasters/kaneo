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
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import {
  milestoneTable,
  projectTable,
  releaseTable,
  taskTable,
} from "../database/schema";
import { escapeLikePattern } from "../search/like-pattern";
import { boundedTaskRead } from "../task/bounded-read";
import type { ReleaseLinkCandidatesQuery } from "./link-candidates-schema";

export async function readReleaseLinkCandidates(
  id: string,
  expectedProjectId: string | undefined,
  expectedWorkspaceId: string,
  options: ReleaseLinkCandidatesQuery,
) {
  return boundedTaskRead(async (tx) => {
    const [release] = await tx
      .select({
        projectId: releaseTable.projectId,
        workspaceId: projectTable.workspaceId,
        projectSlug: projectTable.slug,
      })
      .from(releaseTable)
      .innerJoin(projectTable, eq(projectTable.id, releaseTable.projectId))
      .where(eq(releaseTable.id, id));
    if (!release)
      throw new HTTPException(404, { message: "Release not found" });
    if (
      release.projectId !== expectedProjectId ||
      release.workspaceId !== expectedWorkspaceId
    )
      throw new HTTPException(409, {
        message: "Release changed projects or workspaces; retry the request",
      });

    const { page, limit } = options;
    const pattern = options.q ? `%${escapeLikePattern(options.q)}%` : null;
    const currentRelease = alias(releaseTable, "candidate_current_release");
    if (options.kind === "milestone") {
      const where = and(
        eq(taskTable.projectId, release.projectId),
        eq(taskTable.type, "feature"),
        or(isNull(milestoneTable.releaseId), ne(milestoneTable.releaseId, id)),
        pattern
          ? or(
              ilike(milestoneTable.title, pattern),
              ilike(taskTable.title, pattern),
            )
          : undefined,
      );
      const [totals] = await tx
        .select({ total: count() })
        .from(milestoneTable)
        .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
        .where(where);
      const rows = await tx
        .select({
          id: milestoneTable.id,
          title: milestoneTable.title,
          type: sql<"milestone">`'milestone'`,
          number: sql<null>`null`,
          featureId: taskTable.id,
          featureTitle: taskTable.title,
          releaseId: currentRelease.id,
          releaseName: currentRelease.name,
        })
        .from(milestoneTable)
        .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
        .leftJoin(
          currentRelease,
          and(
            eq(currentRelease.id, milestoneTable.releaseId),
            eq(currentRelease.projectId, release.projectId),
          ),
        )
        .where(where)
        .orderBy(
          asc(taskTable.title),
          asc(taskTable.id),
          asc(milestoneTable.position),
          asc(milestoneTable.id),
        )
        .limit(limit)
        .offset((page - 1) * limit);
      const total = totals?.total ?? 0;
      return {
        data: rows.map((row) => ({ ...row, projectSlug: release.projectSlug })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const feature = alias(taskTable, "candidate_feature");
    const where = and(
      eq(taskTable.projectId, release.projectId),
      inArray(taskTable.type, ["task", "bug"]),
      ne(taskTable.status, "archived"),
      or(isNull(taskTable.releaseId), ne(taskTable.releaseId, id)),
      pattern
        ? or(
            ilike(taskTable.title, pattern),
            ilike(
              sql<string>`${release.projectSlug} || '-' || ${taskTable.number}::text`,
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
        featureId: feature.id,
        featureTitle: feature.title,
        releaseId: currentRelease.id,
        releaseName: currentRelease.name,
      })
      .from(taskTable)
      .leftJoin(
        feature,
        and(
          eq(feature.id, taskTable.featureId),
          eq(feature.projectId, release.projectId),
          eq(feature.type, "feature"),
        ),
      )
      .leftJoin(
        currentRelease,
        and(
          eq(currentRelease.id, taskTable.releaseId),
          eq(currentRelease.projectId, release.projectId),
        ),
      )
      .where(where)
      .orderBy(asc(taskTable.number), asc(taskTable.id))
      .limit(limit)
      .offset((page - 1) * limit);
    const total = totals?.total ?? 0;
    return {
      data: rows.map((row) => ({ ...row, projectSlug: release.projectSlug })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }, "Release link candidates request took too long; retry later");
}
