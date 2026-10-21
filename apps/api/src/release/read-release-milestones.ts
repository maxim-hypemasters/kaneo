import { and, asc, eq, exists, inArray, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import {
  milestoneTable,
  projectTable,
  releaseTable,
  taskTable,
} from "../database/schema";
import { boundedTaskRead } from "../task/bounded-read";
import { readMilestoneExecution } from "../milestone/execution";

export async function readReleaseMilestones(
  id: string,
  expectedProjectId: string | undefined,
  expectedWorkspaceId: string,
  timeZone = "UTC",
) {
  return boundedTaskRead(async (tx) => {
    const [release] = await tx
      .select({
        projectId: releaseTable.projectId,
        workspaceId: projectTable.workspaceId,
      })
      .from(releaseTable)
      .innerJoin(projectTable, eq(projectTable.id, releaseTable.projectId))
      .where(eq(releaseTable.id, id));
    if (!release)
      throw new HTTPException(404, { message: "Release not found" });
    // Authorization ran before this snapshot. A project may have moved since.
    if (
      release.projectId !== expectedProjectId ||
      release.workspaceId !== expectedWorkspaceId
    )
      throw new HTTPException(409, {
        message: "Release changed projects or workspaces; retry the request",
      });

    const leaf = alias(taskTable, "release_milestone_leaf");
    const milestones = await tx
      .select({
        id: milestoneTable.id,
        featureId: milestoneTable.featureId,
        title: milestoneTable.title,
        position: milestoneTable.position,
        featureTitle: taskTable.title,
        leadId: milestoneTable.leadId,
        priority: milestoneTable.priority,
        releaseId: milestoneTable.releaseId,
      })
      .from(milestoneTable)
      .innerJoin(taskTable, eq(taskTable.id, milestoneTable.featureId))
      .where(
        and(
          eq(taskTable.projectId, release.projectId),
          eq(taskTable.type, "feature"),
          or(
            eq(milestoneTable.releaseId, id),
            exists(
              tx
                .select({ id: leaf.id })
                .from(leaf)
                .where(
                  and(
                    eq(leaf.projectId, release.projectId),
                    eq(leaf.featureId, taskTable.id),
                    eq(leaf.releaseId, id),
                    inArray(leaf.type, ["task", "bug"]),
                    ne(leaf.status, "archived"),
                  ),
                ),
            ),
          ),
        ),
      )
      .orderBy(
        asc(milestoneTable.featureId),
        asc(milestoneTable.position),
        asc(milestoneTable.id),
      );
    const schedules = await readMilestoneExecution(
      tx,
      release.projectId,
      milestones.map((milestone) => milestone.id),
      timeZone,
    );
    return milestones.map((milestone) => ({
      ...milestone,
      status: schedules.get(milestone.id)?.status ?? ("to-do" as const),
      columnId: null,
      startDate: schedules.get(milestone.id)?.startDate ?? null,
      endDate: schedules.get(milestone.id)?.endDate ?? null,
    }));
  }, "Release milestones request took too long; retry later");
}
