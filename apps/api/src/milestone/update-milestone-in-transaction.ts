import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { milestoneTable } from "../database/schema";
import type { MilestoneTransaction } from "./membership";
import {
  moveMilestoneFollowers,
  recordMilestoneActivity,
  resolveMilestonePlanning,
  type MilestonePlanningFields,
} from "./planning";

type MilestoneUpdateFields = Partial<
  MilestonePlanningFields & { title: string; description?: string | null }
>;

// The caller holds the project, owning Feature and milestone locks. Keep the
// follower move and activity in that same transaction for composed writes.
export async function updateMilestoneInTransaction(
  tx: MilestoneTransaction,
  current: typeof milestoneTable.$inferSelect,
  projectId: string,
  fields: MilestoneUpdateFields,
  userId: string,
) {
  const planning = await resolveMilestonePlanning(tx, projectId, fields);
  const movedTaskIds =
    fields.releaseId !== undefined && fields.releaseId !== current.releaseId
      ? await moveMilestoneFollowers(
          tx,
          current,
          projectId,
          fields.releaseId,
          userId,
        )
      : [];
  const [updated] = await tx
    .update(milestoneTable)
    .set({ ...fields, ...planning })
    .where(eq(milestoneTable.id, current.id))
    .returning();
  if (!updated)
    throw new HTTPException(404, { message: "Milestone not found" });
  await recordMilestoneActivity(
    tx,
    current.featureId,
    updated,
    "milestone_updated",
    userId,
    Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        { from: current[key as keyof typeof current], to: value },
      ]),
    ),
  );
  return { milestone: updated, movedTaskIds };
}
