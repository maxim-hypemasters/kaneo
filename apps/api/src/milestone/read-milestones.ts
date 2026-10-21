import { lockAuthorizedProject } from "./access-scope";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { columnTable, milestoneTable, taskTable } from "../database/schema";
import type { MilestoneTransaction } from "./membership";
import { milestoneProgress } from "./progress";
import { readMilestoneExecution } from "./execution";
import { milestoneMetadata } from "./metadata";

type ReadDatabase = Pick<MilestoneTransaction, "select">;
export async function readMilestones(
  featureId: string,
  database: ReadDatabase = db,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
  timeZone = "UTC",
) {
  await lockAuthorizedProject(database, expectedProjectId, expectedWorkspaceId);
  const [feature] = await database
    .select({ projectId: taskTable.projectId, type: taskTable.type })
    .from(taskTable)
    .where(eq(taskTable.id, featureId))
    .for("share");
  if (!feature) throw new HTTPException(404, { message: "Feature not found" });
  if (expectedProjectId && feature.projectId !== expectedProjectId)
    throw new HTTPException(409, {
      message: "Feature changed projects; retry the request",
    });
  if (feature.type !== "feature")
    throw new HTTPException(409, { message: "That task isn't a feature" });
  const milestones = await database
    .select()
    .from(milestoneTable)
    .where(eq(milestoneTable.featureId, featureId))
    .orderBy(asc(milestoneTable.position), asc(milestoneTable.id));
  if (!milestones.length) return [];
  const columns = await database
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      position: columnTable.position,
      isFinal: columnTable.isFinal,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, feature.projectId));
  const statuses = await database
    .select({
      milestoneId: taskTable.milestoneId,
      status: taskTable.status,
      count: count(),
    })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, feature.projectId),
        eq(taskTable.featureId, featureId),
        inArray(taskTable.type, ["task", "bug"]),
        inArray(
          taskTable.milestoneId,
          milestones.map((row) => row.id),
        ),
      ),
    )
    .groupBy(taskTable.milestoneId, taskTable.status);
  const schedules = await readMilestoneExecution(
    database,
    feature.projectId,
    milestones.map((row) => row.id),
    timeZone,
  );
  return milestones.map((row) => ({
    ...milestoneMetadata(row, schedules.get(row.id)),
    progress: milestoneProgress(
      statuses.filter((status) => status.milestoneId === row.id),
      columns,
    ),
  }));
}

export async function readMilestone(
  id: string,
  database: ReadDatabase = db,
  expectedProjectId?: string,
  expectedWorkspaceId?: string,
  timeZone = "UTC",
) {
  const [row] = await database
    .select({ featureId: milestoneTable.featureId })
    .from(milestoneTable)
    .where(eq(milestoneTable.id, id));
  if (!row) throw new HTTPException(404, { message: "Milestone not found" });
  const found = (
    await readMilestones(
      row.featureId,
      database,
      expectedProjectId,
      expectedWorkspaceId,
      timeZone,
    )
  ).find((milestone) => milestone.id === id);
  if (!found) throw new HTTPException(404, { message: "Milestone not found" });
  return found;
}
