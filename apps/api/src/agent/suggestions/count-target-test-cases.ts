import { count, eq } from "drizzle-orm";
import db from "../../database";
import { testCaseTable } from "../../database/schema";
import { type MissingFieldsTask, testCaseTarget } from "./missing-fields";

/** Test cases linked to the bug, or to the task's milestone; else 0. */
export async function countTargetTestCases(
  task: Pick<MissingFieldsTask, "type" | "milestoneId"> & { id: string },
) {
  const target = testCaseTarget(task);
  if (target === "description") return 0;
  const [row] = await db
    .select({ count: count() })
    .from(testCaseTable)
    .where(
      target === "bug"
        ? eq(testCaseTable.bugId, task.id)
        : eq(testCaseTable.milestoneId, task.milestoneId ?? ""),
    );
  return row?.count ?? 0;
}
