import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { milestoneTable, taskTable } from "../database/schema";
import { lockMilestone } from "../milestone/membership";
import type { TestCaseTransaction } from "./access";

// Checks that new link targets belong to the test case's project and locks
// them FOR SHARE, so a concurrent move or delete waits for this write.
export async function lockTestCaseLinks(
  tx: TestCaseTransaction,
  projectId: string,
  {
    milestoneId,
    bugId,
  }: { milestoneId?: string | null; bugId?: string | null },
) {
  if (bugId) {
    const [bug] = await tx
      .select({ type: taskTable.type })
      .from(taskTable)
      .where(and(eq(taskTable.id, bugId), eq(taskTable.projectId, projectId)))
      .for("share");
    if (!bug) throw new HTTPException(404, { message: "Bug not found" });
    if (bug.type !== "bug")
      throw new HTTPException(400, {
        message: "Only bugs can be linked to a test case",
      });
  }
  if (milestoneId) {
    const [milestone] = await tx
      .select({ featureId: milestoneTable.featureId })
      .from(milestoneTable)
      .where(eq(milestoneTable.id, milestoneId));
    if (!milestone)
      throw new HTTPException(404, { message: "Milestone not found" });
    try {
      await lockMilestone(tx, milestoneId, milestone.featureId, projectId);
    } catch (error) {
      // Its feature is in another project: report the milestone as missing.
      if (error instanceof HTTPException && error.status === 404)
        throw new HTTPException(404, { message: "Milestone not found" });
      throw error;
    }
  }
}
