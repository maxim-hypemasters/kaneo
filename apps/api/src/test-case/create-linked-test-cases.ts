import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { testCaseTable } from "../database/schema";
import { lockAuthorizedProject } from "../milestone/access-scope";
import { retryTransaction } from "../utils/retry-transaction";
import { lockTestCaseLinks } from "./lock-test-case-links";
import { publishTestCaseChange } from "./publish-test-case-change";
import { createTestCaseBody } from "./schema";

export type TestCaseLink = { bugId: string } | { milestoneId: string };
export type LinkedTestCaseDraft = {
  title: string;
  steps?: string | null;
  expectedResult?: string | null;
};

const draftSchema = createTestCaseBody.pick({
  title: true,
  steps: true,
  expectedResult: true,
});

// Creates several test cases linked to one Bug or milestone, all or none,
// and announces them once. Unlike createTestCase it never notifies people
// @mentioned in the text: callers pass text nobody in the workspace wrote.
// Returns the new ids in the order given.
export async function createLinkedTestCases({
  projectId,
  workspaceId,
  link,
  cases,
  createdBy,
}: {
  projectId: string;
  workspaceId: string;
  link: TestCaseLink;
  cases: readonly LinkedTestCaseDraft[];
  createdBy: string;
}): Promise<string[]> {
  const drafts = cases.map(({ title, steps, expectedResult }) => {
    const parsed = draftSchema.safeParse({ title, steps, expectedResult });
    if (!parsed.success)
      throw new HTTPException(400, { message: "Invalid test case" });
    return parsed.data;
  });
  if (!drafts.length) return [];
  const ids = drafts.map(() => createId());
  await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, projectId, workspaceId);
      await lockTestCaseLinks(tx, projectId, link);
      await tx.insert(testCaseTable).values(
        drafts.map((draft, index) => ({
          id: ids[index],
          projectId,
          title: draft.title,
          steps: draft.steps ?? null,
          expectedResult: draft.expectedResult ?? null,
          bugId: "bugId" in link ? link.bugId : null,
          milestoneId: "milestoneId" in link ? link.milestoneId : null,
          createdBy,
          // Lists sort by creation time; one statement would give every row
          // the same instant and leave their order to the random ids.
          createdAt: sql`(now() AT TIME ZONE 'utc') + ${`${index} milliseconds`}::interval`,
        })),
      );
    }),
  );
  await publishTestCaseChange(
    { projectId, workspaceId, userId: createdBy },
    ids[0]!,
  );
  return ids;
}
