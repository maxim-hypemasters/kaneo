import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { lockAuthorizedProject } from "../../apps/api/src/milestone/access-scope";
import {
  readMilestone,
  readMilestones,
} from "../../apps/api/src/milestone/read-milestones";
import {
  createMilestone,
  deleteMilestone,
  reorderMilestones,
  updateMilestone,
} from "../../apps/api/src/milestone/write-milestones";
import createTask from "../../apps/api/src/task/controllers/create-task";
import duplicateTask from "../../apps/api/src/task/controllers/duplicate-task";
import updateTaskMilestone from "../../apps/api/src/task/controllers/update-task-milestone";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);
async function setup() {
  const source = await createWorkspaceMember({ role: "owner" });
  const target = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: source.workspace.id,
  });
  const feature = await insertTask(project.id, { type: "feature" });
  const task = await insertTask(project.id, { featureId: feature.id });
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: task.number ?? 0 })
    .where(eq(schema.projectTable.id, project.id));
  const [milestone] = await db
    .insert(schema.milestoneTable)
    .values({ featureId: feature.id, title: "Workspace scoped milestone" })
    .returning();
  return { source, target, project, feature, task, milestone: milestone! };
}

describe("milestone workspace scope", () => {
  it("rejects stale milestone reads and writes when the whole Project has moved workspaces", async () => {
    const ctx = await setup();
    const { project, feature, milestone, task, source, target } = ctx;
    // Simulate the move committing after middleware authorized this source
    // workspace. Project identity remains the same across workspace moves.
    await db
      .update(schema.projectTable)
      .set({ workspaceId: target.workspace.id })
      .where(eq(schema.projectTable.id, project.id));
    const conflict = { status: 409 };
    await expect(
      createTask({
        projectId: project.id,
        title: "Stale creation",
        type: "bug",
        featureId: feature.id,
        milestoneId: milestone.id,
        status: "to-do",
        currentUserId: source.user.id,
        expectedWorkspaceId: source.workspace.id,
      }),
    ).rejects.toMatchObject(conflict);
    await db
      .update(schema.taskTable)
      .set({ milestoneId: milestone.id })
      .where(eq(schema.taskTable.id, task.id));
    await expect(
      duplicateTask({
        taskId: task.id,
        currentUserId: source.user.id,
        expectedWorkspaceId: source.workspace.id,
      }),
    ).rejects.toMatchObject(conflict);
    await db
      .update(schema.taskTable)
      .set({ milestoneId: null })
      .where(eq(schema.taskTable.id, task.id));

    await expect(
      db.transaction((tx) =>
        readMilestones(feature.id, tx, project.id, source.workspace.id),
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      db.transaction((tx) =>
        readMilestone(milestone.id, tx, project.id, source.workspace.id),
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      createMilestone(
        feature.id,
        { title: "Stale" },
        source.user.id,
        project.id,
        source.workspace.id,
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      updateMilestone(
        milestone.id,
        { title: "Stale" },
        source.user.id,
        project.id,
        source.workspace.id,
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      deleteMilestone(
        milestone.id,
        source.user.id,
        project.id,
        source.workspace.id,
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      reorderMilestones(
        feature.id,
        [milestone.id],
        source.user.id,
        project.id,
        source.workspace.id,
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      updateTaskMilestone({
        id: task.id,
        milestoneId: milestone.id,
        currentUserId: source.user.id,
        expectedProjectId: project.id,
        expectedWorkspaceId: source.workspace.id,
      }),
    ).rejects.toMatchObject(conflict);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, task.id),
        })
      )?.milestoneId,
    ).toBeNull();
    expect(
      (
        await db.query.milestoneTable.findFirst({
          where: eq(schema.milestoneTable.id, milestone.id),
        })
      )?.title,
    ).toBe(milestone.title);
    expect(
      (
        await db.transaction((tx) =>
          readMilestones(feature.id, tx, project.id, target.workspace.id),
        )
      )[0]?.id,
    ).toBe(milestone.id);
  });

  it("holds a compatible read lock that blocks the Project move controller’s FOR UPDATE lock", async () => {
    const ctx = await setup();
    await db.transaction(async (tx) => {
      await lockAuthorizedProject(tx, ctx.project.id, ctx.source.workspace.id);
      await expect(
        db.transaction(async (move) => {
          await move.execute(sql`set local lock_timeout = '100ms'`);
          await move
            .select({ id: schema.projectTable.id })
            .from(schema.projectTable)
            .where(eq(schema.projectTable.id, ctx.project.id))
            .for("update");
        }),
      ).rejects.toMatchObject({ cause: { code: "55P03" } });
      // A second read shares the lock rather than serializing readers.
      await db.transaction((reader) =>
        lockAuthorizedProject(reader, ctx.project.id, ctx.source.workspace.id),
      );
    });
    await db.transaction(async (tx) => {
      await tx
        .select({ id: schema.projectTable.id })
        .from(schema.projectTable)
        .where(eq(schema.projectTable.id, ctx.project.id))
        .for("update");
      await tx
        .update(schema.projectTable)
        .set({ workspaceId: ctx.target.workspace.id })
        .where(eq(schema.projectTable.id, ctx.project.id));
    });
    expect(
      (
        await db.query.projectTable.findFirst({
          where: eq(schema.projectTable.id, ctx.project.id),
        })
      )?.workspaceId,
    ).toBe(ctx.target.workspace.id);
  });
  it("serializes scoped task creation and duplication without project-lock upgrades", async () => {
    const ctx = await setup();
    const created = await Promise.all(
      ["First", "Second"].map((title) =>
        createTask({
          projectId: ctx.project.id,
          title,
          type: "bug",
          featureId: ctx.feature.id,
          milestoneId: ctx.milestone.id,
          status: "to-do",
          currentUserId: ctx.source.user.id,
          expectedWorkspaceId: ctx.source.workspace.id,
        }),
      ),
    );
    const copies = await Promise.all(
      [0, 1].map(() =>
        duplicateTask({
          taskId: created[0]!.id,
          currentUserId: ctx.source.user.id,
          expectedWorkspaceId: ctx.source.workspace.id,
        }),
      ),
    );
    const work = [...created, ...copies];
    expect(new Set(work.map((task) => task.number)).size).toBe(4);
    for (const task of work)
      expect(task).toMatchObject({
        featureId: ctx.feature.id,
        milestoneId: ctx.milestone.id,
      });
  });
});
