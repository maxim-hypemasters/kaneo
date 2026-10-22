import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import { milestoneTable, taskTable } from "../database/schema";
import { assertAuthorizedProjectSnapshot } from "../milestone/access-scope";
import { escapeLikePattern } from "../search/like-pattern";
import { boundedTaskRead } from "../task/bounded-read";
import type { ReleaseMilestoneLinkCandidatesQuery } from "./link-candidates-schema";

export function readReleaseMilestoneLinkCandidates(
  projectId: string,
  expectedWorkspaceId: string,
  options: ReleaseMilestoneLinkCandidatesQuery,
) {
  return boundedTaskRead(async (tx) => {
    await assertAuthorizedProjectSnapshot(tx, projectId, expectedWorkspaceId);
    const { page, limit } = options;
    const pattern = options.q ? `%${escapeLikePattern(options.q)}%` : null;
    const where = and(
      eq(taskTable.projectId, projectId),
      eq(taskTable.type, "feature"),
      isNull(milestoneTable.releaseId),
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
    const data = await tx
      .select({
        id: milestoneTable.id,
        title: milestoneTable.title,
        featureId: taskTable.id,
        featureTitle: taskTable.title,
      })
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
    const total = totals?.total ?? 0;
    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }, "Release milestone candidates request took too long; retry later");
}
