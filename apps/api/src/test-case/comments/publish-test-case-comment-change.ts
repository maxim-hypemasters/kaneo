import { publishEvent } from "../../events";
import type { TestCaseScope } from "../schema";

export async function publishTestCaseCommentChange(
  scope: TestCaseScope,
  testCaseId: string,
) {
  await publishEvent("test-case.comment.changed", {
    projectId: scope.projectId,
    testCaseId,
    userId: scope.userId,
  });
}
