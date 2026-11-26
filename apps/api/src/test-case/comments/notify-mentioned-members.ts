import { eq } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";
import createNotification from "../../notification/controllers/create-notification";
import { workspaceMembersWithPermission } from "../../utils/workspace-members-with-permission";
import type { TestCaseScope } from "../schema";

// Members @mentioned in a new comment or newly in the test case's text,
// other than the author. The notification names the test case, so it only
// goes to members who may read test cases; createNotification drops anyone
// without access to the project.
export async function notifyMentionedMembers(
  scope: TestCaseScope,
  testCase: { id: string; title: string },
  mentionedIds: string[],
) {
  const mentioned = mentionedIds.filter((id) => id !== scope.userId);
  if (mentioned.length === 0) return;

  const readers = new Set(
    await workspaceMembersWithPermission(scope.workspaceId, {
      test_case: ["read"],
    }),
  );
  const [author] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, scope.userId));

  for (const userId of mentioned) {
    if (!readers.has(userId)) continue;
    await createNotification({
      userId,
      type: "test_case_mention",
      eventData: {
        testCaseTitle: testCase.title,
        mentionerName: author?.name ?? null,
        projectId: scope.projectId,
        workspaceId: scope.workspaceId,
      },
      resourceId: testCase.id,
      resourceType: "test_case",
    });
  }
}
