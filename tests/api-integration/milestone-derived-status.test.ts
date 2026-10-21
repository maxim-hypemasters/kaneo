import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { readMilestone } from "../../apps/api/src/milestone/read-milestones";
import { createMilestone } from "../../apps/api/src/milestone/write-milestones";
import { getRelease } from "../../apps/api/src/release/read-releases";
import moveUnfinishedItems from "../../apps/api/src/release/controllers/move-unfinished-items";
import exportTasks from "../../apps/api/src/task/controllers/export-tasks";
import updateTaskStatus from "../../apps/api/src/task/controllers/update-task-status";
import deleteColumn from "../../apps/api/src/column/controllers/delete-column";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const feature = await insertTask(fixture.project.id, { type: "feature" });
  const release = await insertRelease(fixture.project.id);
  const milestone = await createMilestone(
    feature.id,
    { title: "Checkpoint", releaseId: release.id },
    member.user.id,
  );
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const leaf = (
    status: string,
    values: Partial<typeof schema.taskTable.$inferInsert> = {},
  ) =>
    insertTask(fixture.project.id, {
      featureId: feature.id,
      milestoneId: milestone.id,
      status,
      ...values,
    });
  return { ...member, ...fixture, feature, release, milestone, call, leaf };
}

describe("milestone workflow derived from linked work", () => {
  it.each([
    { statuses: [], expected: "to-do" },
    { statuses: ["archived"], expected: "to-do" },
    { statuses: ["to-do", "done"], expected: "in-progress" },
    { statuses: ["planned", "unknown", "backlog"], expected: "to-do" },
    { statuses: ["in-progress", "done"], expected: "in-progress" },
    { statuses: ["in-review", "to-do"], expected: "in-progress" },
    { statuses: ["done", "done", "archived"], expected: "done" },
  ])("derives $expected from $statuses", async ({ statuses, expected }) => {
    const ctx = await setup();
    for (const [i, status] of statuses.entries())
      await ctx.leaf(status, { type: i % 2 ? "bug" : "task" });
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      status: expected,
      columnId: null,
    });
    expect((await getRelease(ctx.release.id)).progress.milestones).toEqual({
      total: 1,
      completed: expected === "done" ? 1 : 0,
    });
  });

  it("returns the same canonical status through every read and export without using stored manual fields", async () => {
    const ctx = await setup();
    await ctx.leaf("in-review");
    await db
      .update(schema.milestoneTable)
      .set({ legacyStatus: "done", legacyColumnId: ctx.columns.done.id })
      .where(eq(schema.milestoneTable.id, ctx.milestone.id));
    const single = await (
      await ctx.call("GET", `/milestone/${ctx.milestone.id}`)
    ).json();
    const list = await (
      await ctx.call("GET", `/milestone/feature/${ctx.feature.id}`)
    ).json();
    const project = await (
      await ctx.call("GET", `/milestone/project/${ctx.project.id}`)
    ).json();
    const release = await (
      await ctx.call("GET", `/release/${ctx.release.id}/milestones`)
    ).json();
    const updated = await (
      await ctx.call("PATCH", `/milestone/${ctx.milestone.id}`, {
        priority: "high",
      })
    ).json();
    for (const value of [
      single,
      list[0],
      project.data[0],
      release[0],
      updated,
    ]) {
      expect(value).toMatchObject({ status: "in-progress", columnId: null });
      expect(value).not.toHaveProperty("legacyStatus");
      expect(value).not.toHaveProperty("legacyColumnId");
    }
    expect(
      (await exportTasks(ctx.project.id, ctx.user.id)).milestones[0],
    ).toMatchObject({ status: "in-progress" });
    expect(
      await db.query.milestoneTable.findFirst({
        where: eq(schema.milestoneTable.id, ctx.milestone.id),
      }),
    ).toMatchObject({
      legacyStatus: "done",
      legacyColumnId: ctx.columns.done.id,
    });
  });

  it("keeps the reserved Backlog status unstarted even after the first nonfinal column", async () => {
    const ctx = await setup();
    await db.insert(schema.columnTable).values({
      projectId: ctx.project.id,
      name: "Backlog",
      slug: "backlog",
      position: 100,
      isFinal: false,
    });
    await ctx.leaf("backlog");
    expect((await readMilestone(ctx.milestone.id)).status).toBe("to-do");
  });

  it("rejects manual status and column writes including null before changing any metadata", async () => {
    const ctx = await setup();
    for (const fields of [
      { status: "done" },
      { status: null },
      { columnId: ctx.columns.done.id },
      { columnId: null },
    ]) {
      expect(
        (
          await ctx.call("PATCH", `/milestone/${ctx.milestone.id}`, {
            title: "Rejected",
            ...fields,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await ctx.call("POST", `/milestone/feature/${ctx.feature.id}`, {
            title: "Rejected",
            ...fields,
          })
        ).status,
      ).toBe(400);
    }
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      title: "Checkpoint",
      status: "to-do",
    });
  });

  it("tracks workflow ordering and Done flags without changing linked work", async () => {
    const ctx = await setup();
    const leaf = await ctx.leaf("in-progress");
    expect((await readMilestone(ctx.milestone.id)).status).toBe("in-progress");
    await db
      .update(schema.columnTable)
      .set({ position: -1 })
      .where(eq(schema.columnTable.id, ctx.columns.inProgress.id));
    expect((await readMilestone(ctx.milestone.id)).status).toBe("to-do");
    await db
      .update(schema.columnTable)
      .set({ isFinal: true })
      .where(eq(schema.columnTable.id, ctx.columns.inProgress.id));
    expect((await readMilestone(ctx.milestone.id)).status).toBe("done");
    expect(
      (await getRelease(ctx.release.id)).progress.milestones?.completed,
    ).toBe(1);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, leaf.id),
        })
      )?.status,
    ).toBe("in-progress");
  });

  it("uses full milestone membership for release completion and Move unfinished independently of child release overrides", async () => {
    const ctx = await setup();
    const target = await insertRelease(ctx.project.id);
    const outside = await ctx.leaf("done", { releaseId: target.id });
    await ctx.leaf("archived", { releaseId: ctx.release.id });
    expect((await getRelease(ctx.release.id)).progress.milestones).toEqual({
      total: 1,
      completed: 1,
    });
    expect(
      (await moveUnfinishedItems(ctx.release.id, target.id, ctx.user.id))
        .movedMilestoneIds,
    ).toEqual([]);
    await updateTaskStatus({
      id: outside.id,
      status: "to-do",
      currentUserId: ctx.user.id,
    });
    expect(
      (await getRelease(ctx.release.id)).progress.milestones?.completed,
    ).toBe(0);
    expect(
      (await moveUnfinishedItems(ctx.release.id, target.id, ctx.user.id))
        .movedMilestoneIds,
    ).toEqual([ctx.milestone.id]);
    expect(
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, outside.id),
        })
      )?.releaseId,
    ).toBe(target.id);
  });

  it("preserves existing milestone history and does not write status history on reads", async () => {
    const ctx = await setup();
    const leaf = await ctx.leaf("done");
    await db.insert(schema.activityTable).values({
      taskId: ctx.feature.id,
      type: "milestone_completed",
      userId: ctx.user.id,
      eventData: {
        projectId: ctx.project.id,
        milestoneId: ctx.milestone.id,
        milestoneTitle: ctx.milestone.title,
      },
    });
    const before = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, ctx.feature.id));
    await readMilestone(ctx.milestone.id);
    await ctx.call("GET", `/milestone/project/${ctx.project.id}`);
    await getRelease(ctx.release.id);
    expect(
      await db
        .select()
        .from(schema.activityTable)
        .where(eq(schema.activityTable.taskId, ctx.feature.id)),
    ).toEqual(before);
    await updateTaskStatus({
      id: leaf.id,
      status: "in-progress",
      currentUserId: ctx.user.id,
    });
    expect((await readMilestone(ctx.milestone.id)).status).toBe("in-progress");
    expect(
      await db
        .select()
        .from(schema.activityTable)
        .where(eq(schema.activityTable.taskId, ctx.feature.id)),
    ).toEqual(before);
    expect(
      await db
        .select()
        .from(schema.activityTable)
        .where(eq(schema.activityTable.taskId, leaf.id)),
    ).toHaveLength(1);
  });

  it("does not block column deletion because a former manual milestone status referenced it", async () => {
    const ctx = await setup();
    await db
      .update(schema.milestoneTable)
      .set({ legacyStatus: "done", legacyColumnId: ctx.columns.done.id })
      .where(eq(schema.milestoneTable.id, ctx.milestone.id));
    await deleteColumn(ctx.columns.done.id);
    expect(await readMilestone(ctx.milestone.id)).toMatchObject({
      status: "to-do",
      columnId: null,
    });
  });
});
