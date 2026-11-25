import { randomUUID } from "node:crypto";
import db, { schema } from "../../../../apps/api/src/database";
import { createApp } from "../../../../apps/api/src/index";
import { createProjectFixture, createWorkspaceMember } from "../fixtures";
import { jsonRequest } from "../release/json-request";

// A test case in a project, its author, and requests against its comments.
export async function createCommentFixture(role = "member") {
  const author = await createWorkspaceMember({ role });
  const { project } = await createProjectFixture({
    workspaceId: author.workspace.id,
  });
  const [testCase] = await db
    .insert(schema.testCaseTable)
    .values({ projectId: project.id, title: "Checks out" })
    .returning();
  const app = createApp().app;
  return {
    author,
    project,
    testCase: testCase!,
    request: (method: string, path = "", body?: unknown) =>
      app.request(
        `/api/test-case/${testCase!.id}${path}`,
        body === undefined ? { method } : jsonRequest(method, body),
      ),
    app,
  };
}

// Another user in the fixture's workspace.
export async function addMember(workspaceId: string, role = "member") {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name: "Teammate",
    })
    .returning();
  await db
    .insert(schema.workspaceUserTable)
    .values({ workspaceId, userId: id, role, joinedAt: new Date() });
  return user!;
}

export const mention = (userId: string) =>
  `<kaneo-mention id="${userId}" label="Name"></kaneo-mention>`;
