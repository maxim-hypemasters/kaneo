import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import moveTask from "../../apps/api/src/task/controllers/move-task";
import updateTaskType from "../../apps/api/src/task/controllers/update-task-type";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

async function setup() {
  const ctx = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  const { project: destination } = await createProjectFixture({
    workspaceId: ctx.workspace.id,
  });
  const feature = await insertTask(project.id, { type: "feature" });
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature.id, title: "Beta" })
    .returning();
  const bug = await insertTask(project.id, { type: "bug" });
  const [testCase] = await db
    .insert(schema.testCaseTable)
    .values({
      projectId: project.id,
      title: "Checks out",
      milestoneId: milestone!.id,
      bugId: bug.id,
    })
    .returning();
  const read = async () =>
    (await db.query.testCaseTable.findFirst({
      where: eq(schema.testCaseTable.id, testCase!.id),
    }))!;
  return {
    ...ctx,
    project,
    destination,
    feature,
    milestone: milestone!,
    bug,
    read,
  };
}

describe("test case links across moves", () => {
  it("unlinks a bug moved to another project", async () => {
    const ctx = await setup();
    await moveTask({
      taskId: ctx.bug.id,
      destinationProjectId: ctx.destination.id,
      currentUserId: ctx.user.id,
    });
    expect(await ctx.read()).toMatchObject({
      projectId: ctx.project.id,
      bugId: null,
      milestoneId: ctx.milestone.id,
    });
  });

  it("unlinks the milestones of a Feature moved to another project", async () => {
    const ctx = await setup();
    await moveTask({
      taskId: ctx.feature.id,
      destinationProjectId: ctx.destination.id,
      currentUserId: ctx.user.id,
    });
    expect(await ctx.read()).toMatchObject({
      milestoneId: null,
      bugId: ctx.bug.id,
    });
  });

  it("keeps the link when a bug becomes a task", async () => {
    const ctx = await setup();
    await updateTaskType({
      id: ctx.bug.id,
      type: "task",
      currentUserId: ctx.user.id,
    });
    expect((await ctx.read()).bugId).toBe(ctx.bug.id);
  });
});
