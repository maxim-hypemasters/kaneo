import { publishEvent } from "../events";
import type { TestCaseScope } from "./schema";

export async function publishTestCaseChange(
  scope: TestCaseScope,
  testCaseId: string,
) {
  await publishEvent("test-case.changed", {
    projectId: scope.projectId,
    testCaseId,
    userId: scope.userId,
  });
}
