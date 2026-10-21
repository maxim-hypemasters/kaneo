import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  createMilestone,
  deleteMilestone,
  updateMilestone,
} from "../../apps/api/src/milestone/write-milestones";
import { readProjectMilestones } from "../../apps/api/src/milestone/read-project-milestones";
import { setTaskMilestone } from "../../apps/api/src/milestone/membership";
import createTask from "../../apps/api/src/task/controllers/create-task";
import updateTaskStatus from "../../apps/api/src/task/controllers/update-task-status";
import { getRelease } from "../../apps/api/src/release/read-releases";
import moveUnfinishedItems from "../../apps/api/src/release/controllers/move-unfinished-items";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);
async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const feature = await createTask({
    projectId: fixture.project.id,
    currentUserId: member.user.id,
    title: "Knowledge base",
    type: "feature",
  });
  const release = await insertRelease(fixture.project.id);
  const milestone = await createMilestone(
    feature.id,
    { title: "Delivery", releaseId: release.id },
    member.user.id,
  );
  const leaf = (
    title: string,
    values: Partial<Parameters<typeof createTask>[0]> = {},
  ) =>
    createTask({
      projectId: fixture.project.id,
      currentUserId: member.user.id,
      title,
      status: "to-do",
      type: "task",
      featureId: feature.id,
      milestoneId: milestone.id,
      ...values,
    });
  return {
    ...member,
    ...fixture,
    app,
    call,
    feature,
    release,
    milestone,
    leaf,
  };
}
async function task(id: string) {
  return db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, id) });
}

describe("Feature knowledge and milestone planning", () => {
  it("keeps Features in the library, excludes them from execution boards, and archives independently", async () => {
    const ctx = await setup();
    expect(ctx.feature).toMatchObject({
      status: null,
      priority: null,
      userId: null,
      columnId: null,
      releaseId: null,
      startDate: null,
      dueDate: null,
      archivedAt: null,
    });
    const child = await ctx.leaf("Implementation");
    const board = await (
      await ctx.call("GET", `/task/tasks/${ctx.project.id}`)
    ).json();
    expect(JSON.stringify(board)).not.toContain('"type":"feature"');
    const library = await (
      await ctx.call("GET", `/task/feature-library/${ctx.project.id}`)
    ).json();
    expect(library.data).toEqual([
      expect.objectContaining({ id: ctx.feature.id, milestoneCount: 1 }),
    ]);
    expect(
      (
        await ctx.call("PUT", `/task/${ctx.feature.id}/feature-archive`, {
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect((await task(ctx.feature.id))?.archivedAt).not.toBeNull();
    expect((await task(child.id))?.status).toBe("to-do");
    expect(
      (
        await (
          await ctx.call(
            "GET",
            `/task/feature-library/${ctx.project.id}?archived=true`,
          )
        ).json()
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await ctx.call("PUT", `/task/${ctx.feature.id}/feature-archive`, {
          archived: false,
        })
      ).status,
    ).toBe(200);
  });
  it("rejects Feature planning and conversion writes before changing records", async () => {
    const ctx = await setup();
    for (const [endpoint, body] of [
      ["status", { status: "done" }],
      ["priority", { priority: "urgent" }],
      ["assignee", { userId: ctx.user.id }],
      ["due-date", { dueDate: "2026-12-01" }],
      ["release", { releaseId: ctx.release.id }],
    ] as const) {
      const response = await ctx.call(
        "PUT",
        `/task/${endpoint}/${ctx.feature.id}`,
        body,
      );
      expect(response.status, `${endpoint}: ${await response.text()}`).toBe(
        400,
      );
    }
    expect(
      (await ctx.call("PUT", `/task/type/${ctx.feature.id}`, { type: "task" }))
        .status,
    ).toBe(409);
    const child = await ctx.leaf("Leaf");
    expect(
      (await ctx.call("PUT", `/task/type/${child.id}`, { type: "feature" }))
        .status,
    ).toBe(400);
    expect((await task(ctx.feature.id))?.status).toBeNull();
  });
  it("validates editable milestone planning while deriving status from child work", async () => {
    const ctx = await setup();
    const child = await ctx.leaf("Unstarted bug", { type: "bug" });
    const updated = await updateMilestone(
      ctx.milestone.id,
      {
        leadId: ctx.user.id,
        priority: "urgent",
      },
      ctx.user.id,
    );
    expect(updated).toMatchObject({
      leadId: ctx.user.id,
      status: "to-do",
      columnId: null,
      priority: "urgent",
      progress: { completed: 0, started: 0, total: 1 },
    });
    expect((await task(child.id))?.status).toBe("to-do");
    expect((await getRelease(ctx.release.id)).progress.milestones).toEqual({
      total: 1,
      completed: 0,
    });
    const history = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, ctx.feature.id));
    expect(history.map((row) => row.type)).not.toContain("milestone_completed");
  });
  it("inherits release only for omitted new-work values and null existing work", async () => {
    const ctx = await setup();
    const inherited = await ctx.leaf("Inherit");
    const explicitNone = await ctx.leaf("Explicit none", { releaseId: null });
    const override = await insertRelease(ctx.project.id);
    const overridden = await ctx.leaf("Override", { releaseId: override.id });
    expect(inherited.releaseId).toBe(ctx.release.id);
    expect(explicitNone.releaseId).toBeNull();
    expect(overridden.releaseId).toBe(override.id);
    const unassigned = await ctx.leaf("Join", {
      milestoneId: null,
      releaseId: null,
    });
    await db.transaction((tx) =>
      setTaskMilestone(tx, unassigned, ctx.milestone.id, ctx.user.id),
    );
    expect((await task(unassigned.id))?.releaseId).toBe(ctx.release.id);
    const next = await insertRelease(ctx.project.id);
    await updateMilestone(
      ctx.milestone.id,
      { releaseId: next.id },
      ctx.user.id,
    );
    expect((await task(inherited.id))?.releaseId).toBe(next.id);
    expect((await task(unassigned.id))?.releaseId).toBe(next.id);
    expect((await task(overridden.id))?.releaseId).toBe(override.id);
    expect((await task(explicitNone.id))?.releaseId).toBeNull();
  });
  it("moves null followers when planning an initially unplanned milestone", async () => {
    const ctx = await setup();
    const blank = await createMilestone(
      ctx.feature.id,
      { title: "Unplanned" },
      ctx.user.id,
    );
    const child = await ctx.leaf("Null follower", { milestoneId: blank.id });
    expect(child.releaseId).toBeNull();
    await updateMilestone(blank.id, { releaseId: ctx.release.id }, ctx.user.id);
    expect((await task(child.id))?.releaseId).toBe(ctx.release.id);
  });
  it("keeps child releases when unlinking and deleting milestones", async () => {
    const ctx = await setup();
    const child = await ctx.leaf("Keep release");
    await deleteMilestone(ctx.milestone.id, ctx.user.id);
    expect(await task(child.id)).toMatchObject({
      featureId: ctx.feature.id,
      milestoneId: null,
      releaseId: ctx.release.id,
    });
    const history = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, ctx.feature.id),
          eq(schema.activityTable.type, "milestone_deleted"),
        ),
      );
    expect(history[0]?.eventData).toMatchObject({ milestoneTitle: "Delivery" });
  });
  it("moves unfinished milestones and leaves independently", async () => {
    const ctx = await setup();
    const finished = await ctx.leaf("Done", { status: "done" });
    const unfinished = await ctx.leaf("Next");
    const next = await insertRelease(ctx.project.id);
    const moved = await moveUnfinishedItems(
      ctx.release.id,
      next.id,
      ctx.user.id,
    );
    expect(moved.movedMilestoneIds).toContain(ctx.milestone.id);
    expect(moved.movedTaskIds).toContain(unfinished.id);
    expect((await task(finished.id))?.releaseId).toBe(ctx.release.id);
    expect((await task(unfinished.id))?.releaseId).toBe(next.id);
  });
  it("includes empty milestones and paginates bounded project summaries without leaking another project", async () => {
    const ctx = await setup();
    await createMilestone(ctx.feature.id, { title: "Second" }, ctx.user.id);
    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    const feature = await createTask({
      projectId: other.project.id,
      currentUserId: ctx.user.id,
      title: "Private group",
      type: "feature",
    });
    await createMilestone(feature.id, { title: "Outside" }, ctx.user.id);
    const first = await readProjectMilestones(ctx.project.id, 1, 1);
    expect(first.pagination).toEqual({
      total: 2,
      page: 1,
      limit: 1,
      totalPages: 2,
    });
    expect(first.data).toHaveLength(1);
    expect(first.data[0]).toMatchObject({
      projectId: ctx.project.id,
      featureTitle: "Knowledge base",
      progress: { total: 0, started: 0, completed: 0 },
    });
    expect((await getRelease(ctx.release.id)).progress).toMatchObject({
      features: { total: 1, completed: 0 },
      milestones: { total: 1, completed: 0 },
    });
  });
  it("rejects cross-project planning references transactionally", async () => {
    const ctx = await setup();
    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    const release = await insertRelease(other.project.id);
    await expect(
      updateMilestone(
        ctx.milestone.id,
        { title: "Must rollback", releaseId: release.id },
        ctx.user.id,
      ),
    ).rejects.toThrow("Release not found");
    const [stored] = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.id, ctx.milestone.id));
    expect(stored?.title).toBe("Delivery");
  });
  it("task completion and reopening change derived milestone status", async () => {
    const ctx = await setup();
    const child = await ctx.leaf("Done bug", { type: "bug" });
    await updateTaskStatus({
      id: child.id,
      status: "done",
      currentUserId: ctx.user.id,
    });
    expect((await readProjectMilestones(ctx.project.id)).data[0]).toMatchObject(
      { status: "done", progress: { total: 1, started: 1, completed: 1 } },
    );
    await updateTaskStatus({
      id: child.id,
      status: "in-progress",
      currentUserId: ctx.user.id,
    });
    expect(
      (await readProjectMilestones(ctx.project.id)).data[0]?.progress,
    ).toEqual({ total: 1, started: 1, completed: 0 });
  });
  it("database checks prevent invalid Feature planning, leaf nulls and identity conversions", async () => {
    const ctx = await setup();
    await expect(
      db
        .update(schema.taskTable)
        .set({ priority: "high" })
        .where(eq(schema.taskTable.id, ctx.feature.id)),
    ).rejects.toThrow();
    const child = await ctx.leaf("Valid leaf");
    await expect(
      db
        .update(schema.taskTable)
        .set({ status: null })
        .where(eq(schema.taskTable.id, child.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(schema.taskTable)
        .set({
          type: "feature",
          status: null,
          priority: null,
          userId: null,
          columnId: null,
          featureId: null,
          milestoneId: null,
          releaseId: null,
        })
        .where(eq(schema.taskTable.id, child.id)),
    ).rejects.toThrow();
    expect((await task(child.id))?.type).toBe("task");
  });
  it("protects library and milestone project reads with task:read API-key scopes", async () => {
    const ctx = await setup();
    for (const [permissions, expected] of [
      [{ task: ["read"] }, 200],
      [{ task: ["update"] }, 403],
      [{ project: ["read"] }, 403],
    ] as const) {
      const key = await auth.api.createApiKey({
        body: {
          userId: ctx.user.id,
          name: "Knowledge scopes",
          permissions: JSON.parse(JSON.stringify(permissions)),
        },
      });
      mockAnonymousSession();
      for (const path of [
        `/task/feature-library/${ctx.project.id}`,
        `/milestone/project/${ctx.project.id}`,
      ])
        expect(
          (
            await ctx.app.request(`/api${path}`, {
              headers: { "x-api-key": key.key },
            })
          ).status,
        ).toBe(expected);
    }
  });
  it("requires task:assign only when changing a Milestone Lead", async () => {
    const ctx = await setup();
    const key = await auth.api.createApiKey({
      body: {
        userId: ctx.user.id,
        name: "Milestone editor",
        permissions: { task: ["update"] },
      },
    });
    mockAnonymousSession();
    const request = (body: unknown) =>
      ctx.app.request(
        `/api/milestone/${ctx.milestone.id}`,
        jsonRequest("PATCH", body, { "x-api-key": key.key }),
      );
    expect((await request({ title: "Edited", leadId: null })).status).toBe(200);
    expect((await request({ leadId: ctx.user.id })).status).toBe(403);
  });
  it("hides knowledge and milestone metadata from anonymous and other-workspace viewers", async () => {
    const ctx = await setup();
    const outsider = await createWorkspaceMember();
    mockAuthenticatedSession(outsider.user);
    for (const path of [
      `/task/feature-library/${ctx.project.id}`,
      `/milestone/project/${ctx.project.id}`,
    ])
      expect((await ctx.call("GET", path)).status).toBe(404);
    mockAnonymousSession();
    expect(
      (await ctx.call("GET", `/milestone/project/${ctx.project.id}`)).status,
    ).toBe(401);
  });
  it("serializes concurrent release following and membership assignment without invalid links", async () => {
    const ctx = await setup();
    const child = await ctx.leaf("Concurrent", {
      milestoneId: null,
      releaseId: null,
    });
    const next = await insertRelease(ctx.project.id);
    const results = await Promise.allSettled([
      db.transaction((tx) =>
        setTaskMilestone(tx, child, ctx.milestone.id, ctx.user.id),
      ),
      updateMilestone(ctx.milestone.id, { releaseId: next.id }, ctx.user.id),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await task(child.id)).toMatchObject({
      featureId: ctx.feature.id,
      milestoneId: ctx.milestone.id,
      releaseId: next.id,
    });
  });

  it("requires project:update for imported releases and task:assign for imported milestone leads", async () => {
    const ctx = await setup();
    for (const [permissions, extra] of [
      [
        { task: ["create", "update"] },
        {
          releases: [
            {
              key: "r",
              name: "Imported",
              startDate: "2026-10-01",
              codeFreezeDate: "2026-10-15",
              submissionDate: "2026-10-20",
            },
          ],
        },
      ],
      [
        { task: ["create", "update"], project: ["update"] },
        {
          milestones: [
            {
              key: "m",
              featureKey: "f",
              title: "Assigned milestone",
              leadId: ctx.user.id,
              position: 0,
            },
          ],
        },
      ],
    ] as const) {
      const key = await auth.api.createApiKey({
        body: {
          userId: ctx.user.id,
          name: "Hierarchy import scopes",
          permissions: JSON.parse(JSON.stringify(permissions)),
        },
      });
      mockAnonymousSession();
      const response = await ctx.app.request(
        `/api/task/import/${ctx.project.id}`,
        jsonRequest(
          "POST",
          {
            version: 3,
            tasks: [
              {
                key: "f",
                title: "Imported Feature",
                type: "feature",
                status: null,
                priority: null,
              },
            ],
            ...extra,
          },
          { "x-api-key": key.key },
        ),
      );
      expect(response.status, await response.text()).toBe(403);
    }
  });
  it("keeps planning snapshots readonly through comment APIs and removes them only with their Feature", async () => {
    const ctx = await setup();
    const [snapshot] = await db
      .insert(schema.activityTable)
      .values({
        taskId: ctx.feature.id,
        userId: ctx.user.id,
        type: "feature_planning_snapshot",
        content: null,
        eventData: {
          projectId: ctx.project.id,
          status: "done",
          priority: "high",
        },
      })
      .returning();
    expect(
      (
        await ctx.call("PUT", "/activity/comment", {
          activityId: snapshot!.id,
          comment: "Changed history",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await ctx.call("DELETE", "/activity/comment", {
          activityId: snapshot!.id,
        })
      ).status,
    ).toBe(404);
    expect(
      await db
        .select()
        .from(schema.activityTable)
        .where(eq(schema.activityTable.id, snapshot!.id)),
    ).toHaveLength(1);
    expect((await ctx.call("DELETE", `/task/${ctx.feature.id}`)).status).toBe(
      200,
    );
    expect(
      await db
        .select()
        .from(schema.activityTable)
        .where(eq(schema.activityTable.id, snapshot!.id)),
    ).toEqual([]);
  });
  it("preserves snapshot payload when deleting its actor clears the user foreign key", async () => {
    const ctx = await setup();
    const actor = await createWorkspaceMember();
    const [snapshot] = await db
      .insert(schema.activityTable)
      .values({
        taskId: ctx.feature.id,
        userId: actor.user.id,
        type: "feature_planning_snapshot",
        eventData: {
          projectId: ctx.project.id,
          status: "done",
          releaseName: "Historical release",
        },
      })
      .returning();
    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, actor.user.id));
    const [retained] = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.id, snapshot!.id));
    expect(retained).toEqual({ ...snapshot, userId: null });
  });
  it("returns only same-workspace active labels in the Feature library", async () => {
    const ctx = await setup();
    const foreign = await createWorkspaceMember();
    await db.insert(schema.labelTable).values([
      {
        taskId: ctx.feature.id,
        workspaceId: ctx.workspace.id,
        name: "Visible label",
        color: "blue",
      },
      {
        taskId: ctx.feature.id,
        workspaceId: foreign.workspace.id,
        name: "Private foreign label",
        color: "red",
      },
      {
        taskId: ctx.feature.id,
        workspaceId: ctx.workspace.id,
        name: "Deleting label",
        color: "gray",
        deletionStartedAt: new Date(),
      },
    ]);
    const response = await ctx.call(
      "GET",
      `/task/feature-library/${ctx.project.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].labels).toEqual([
      expect.objectContaining({ name: "Visible label" }),
    ]);
    expect(JSON.stringify(body)).not.toContain("Private foreign label");
    expect(JSON.stringify(body)).not.toContain("Deleting label");
  });
});
