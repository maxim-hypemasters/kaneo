import { and, asc, eq } from "drizzle-orm";
import { milestoneTable, testCaseTable } from "../database/schema";
import { featureOwner } from "../feature/access";
import { boundedTaskRead } from "../task/bounded-read";
import type {
  TestCaseListQuery,
  TestCaseReadAccess,
  TestCaseScope,
} from "./schema";
import { listTestCases } from "./select-test-cases";

// Test cases linked to any of the Feature's milestones, in milestone order.
export async function listFeatureTestCases(
  scope: TestCaseScope,
  featureId: string,
  query: TestCaseListQuery,
  access: TestCaseReadAccess,
) {
  return boundedTaskRead(async (tx) => {
    await featureOwner(tx, { ...scope, featureId });
    return listTestCases(tx, {
      scope: and(
        eq(testCaseTable.projectId, scope.projectId),
        eq(milestoneTable.featureId, featureId),
      ),
      query,
      access,
      orderBy: [
        asc(milestoneTable.position),
        asc(milestoneTable.id),
        asc(testCaseTable.createdAt),
        asc(testCaseTable.id),
      ],
    });
  }, "Test case request took too long; retry later");
}
