import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { milestoneTable } from "../database/schema";
import type { MilestoneTransaction } from "./membership";
import {
  assertReadonlyMilestoneStatus,
  recordMilestoneActivity,
  resolveMilestonePlanning,
  type MilestonePlanningFields,
} from "./planning";
import { assertReadonlyMilestoneDates } from "./dates";

// The caller holds the Feature FOR UPDATE, or created it in this transaction.
export async function createMilestoneInTransaction(
  tx: MilestoneTransaction,
  feature: { id: string; projectId: string },
  fields: MilestonePlanningFields & {
    title: string;
    description?: string | null;
  },
  userId: string,
) {
  assertReadonlyMilestoneDates(fields);
  assertReadonlyMilestoneStatus(fields);
  const planning = await resolveMilestonePlanning(
    tx,
    feature.projectId,
    fields,
  );
  const [last] = await tx
    .select({
      position: sql<number>`coalesce(max(${milestoneTable.position}), -1)`,
    })
    .from(milestoneTable)
    .where(eq(milestoneTable.featureId, feature.id));
  const [created] = await tx
    .insert(milestoneTable)
    .values({
      featureId: feature.id,
      ...fields,
      ...planning,
      position: Number(last?.position ?? -1) + 1,
    })
    .returning();
  if (!created)
    throw new HTTPException(500, { message: "Failed to create milestone" });
  await recordMilestoneActivity(
    tx,
    feature.id,
    created,
    "milestone_created",
    userId,
  );
  return created;
}
