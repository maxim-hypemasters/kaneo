import { eq, inArray } from "drizzle-orm";
import { milestoneTable, testCaseTable } from "../database/schema";
import type { TestCaseTransaction } from "./access";

// Test cases stay in their project, so a Bug that moves out leaves them, and
// so do the milestones of a Feature that moves out.
export async function unlinkMovedTestCases(
  tx: TestCaseTransaction,
  task: { id: string; type: string },
) {
  await tx
    .update(testCaseTable)
    .set({ bugId: null })
    .where(eq(testCaseTable.bugId, task.id));
  if (task.type !== "feature") return;
  await tx
    .update(testCaseTable)
    .set({ milestoneId: null })
    .where(
      inArray(
        testCaseTable.milestoneId,
        tx
          .select({ id: milestoneTable.id })
          .from(milestoneTable)
          .where(eq(milestoneTable.featureId, task.id)),
      ),
    );
}
