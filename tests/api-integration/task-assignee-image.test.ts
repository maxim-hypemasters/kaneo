import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

describe("API integration: a task's assignee photo", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("comes with the single-task read that realtime updates patch boards from", async () => {
    const member = await createWorkspaceMember({ userName: "Alice" });
    await db
      .update(schema.userTable)
      .set({ image: "https://example.test/alice.png" })
      .where(eq(schema.userTable.id, member.user.id));
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        title: "Cart page",
        number: 1,
        userId: member.user.id,
      })
      .returning();
    if (!task) throw new Error("task not created");

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    for (const query of ["?view=board", ""]) {
      const response = await app.request(`/api/task/${task.id}${query}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        userId: member.user.id,
        assigneeName: "Alice",
        assigneeImage: "https://example.test/alice.png",
      });
    }

    await db
      .update(schema.taskTable)
      .set({ userId: null })
      .where(eq(schema.taskTable.id, task.id));
    const unassigned = await app.request(`/api/task/${task.id}?view=board`);
    expect(await unassigned.json()).toMatchObject({
      userId: null,
      assigneeImage: null,
    });
  });
});
