import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

describe("notification item type", () => {
  it("names the type of the item each notification points at", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const feature = await insertTask(project.id, { type: "feature" });
    const task = await insertTask(project.id);
    const bug = await insertTask(project.id, { type: "bug" });
    const [featureMention, taskMention, bugMention, workspace, alert] = await db
      .insert(schema.notificationTable)
      .values([
        {
          userId: member.user.id,
          type: "task_mention",
          resourceType: "task",
          resourceId: feature.id,
        },
        {
          userId: member.user.id,
          type: "task_mention",
          resourceType: "task",
          resourceId: task.id,
        },
        {
          userId: member.user.id,
          type: "task_comment",
          resourceType: "task",
          resourceId: bug.id,
        },
        {
          userId: member.user.id,
          type: "workspace_created",
          resourceType: "workspace",
          resourceId: member.workspace.id,
        },
        { userId: member.user.id, title: "Integration alert" },
      ])
      .returning();
    mockAuthenticatedSession(member.user);

    const response = await createApp().app.request("/api/notification");
    expect(response.status).toBe(200);
    const typeOf = new Map(
      ((await response.json()) as Array<{ id: string; taskType: unknown }>).map(
        (notification) => [notification.id, notification.taskType],
      ),
    );
    expect(typeOf.get(featureMention!.id)).toBe("feature");
    expect(typeOf.get(taskMention!.id)).toBe("task");
    expect(typeOf.get(bugMention!.id)).toBe("bug");
    expect(typeOf.get(workspace!.id)).toBeNull();
    expect(typeOf.get(alert!.id)).toBeNull();
  });
});
