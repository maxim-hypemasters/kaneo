import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
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
import updateTaskMilestone from "../../apps/api/src/task/controllers/update-task-milestone";
import { setTaskMilestone } from "../../apps/api/src/milestone/membership";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";
import { jsonRequest } from "./helpers/release/json-request";

beforeEach(resetTestDatabase);
async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const release = await insertRelease(fixture.project.id);
  const feature = await insertTask(fixture.project.id, {
    type: "feature",
    releaseId: release.id,
  });
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: feature.number ?? 1 })
    .where(eq(schema.projectTable.id, fixture.project.id));
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const call = (method: string, path: string, body?: unknown) =>
    app.request(
      `/api${path}`,
      body === undefined ? { method } : jsonRequest(method, body),
    );
  const milestone = async (title = "First milestone") => {
    const response = await call("POST", `/milestone/feature/${feature.id}`, {
      title,
      releaseId: release.id,
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  return { ...member, ...fixture, release, feature, app, call, milestone };
}
async function row(id: string) {
  return db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, id) });
}
function taskIds(board: {
  data: {
    columns: { tasks: { id: string }[] }[];
    plannedTasks?: { id: string }[];
  };
}) {
  return board.data.columns.flatMap((column) =>
    column.tasks.map((task) => task.id),
  );
}

describe("feature milestones", () => {
  it("creates ordered empty milestones, trims title, edits and clears metadata", async () => {
    const ctx = await setup();
    const first = await ctx.milestone("  Foundation  ");
    const second = await ctx.milestone();
    expect(first).toMatchObject({
      featureId: ctx.feature.id,
      title: "Foundation",
      position: 0,
      description: null,
      startDate: null,
      endDate: null,
      progress: { total: 0, started: 0, completed: 0 },
    });
    expect(second.position).toBe(1);
    const edit = await ctx.call("PATCH", `/milestone/${first.id}`, {
      description: "A checkpoint",
    });
    expect(edit.status).toBe(200);
    expect(await edit.json()).toMatchObject({
      description: "A checkpoint",
    });
    expect(
      (
        await ctx.call("PATCH", `/milestone/${first.id}`, {
          description: null,
        })
      ).status,
    ).toBe(200);
    expect((await ctx.call("PATCH", `/milestone/${first.id}`, {})).status).toBe(
      400,
    );
    const list = await (
      await ctx.call("GET", `/milestone/feature/${ctx.feature.id}`)
    ).json();
    expect(list.map((item: { id: string }) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("rejects manual date writes including null without changing stored legacy dates", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    await db
      .update(schema.milestoneTable)
      .set({
        legacyStartDate: "2026-10-20",
        legacyEndDate: "2026-10-24",
      })
      .where(eq(schema.milestoneTable.id, milestone.id));
    for (const fields of [
      { startDate: "2026-10-25" },
      { endDate: "2026-10-19" },
      { startDate: null },
      { endDate: null },
      { startDate: "2026-10-20", endDate: "2026-10-24" },
    ]) {
      expect(
        (
          await ctx.call("PATCH", `/milestone/${milestone.id}`, {
            title: "Unchanged",
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
    const final = await (
      await ctx.call("GET", `/milestone/${milestone.id}`)
    ).json();
    expect(final).toMatchObject({
      title: milestone.title,
      startDate: null,
      endDate: null,
    });
    expect(final).not.toHaveProperty("legacyStartDate");
    expect(final).not.toHaveProperty("legacyEndDate");
    expect(
      await db.query.milestoneTable.findFirst({
        where: eq(schema.milestoneTable.id, milestone.id),
      }),
    ).toMatchObject({
      legacyStartDate: "2026-10-20",
      legacyEndDate: "2026-10-24",
    });
  });

  it("requires a Feature owner and validates titles and calendar dates", async () => {
    const ctx = await setup();
    const leaf = await insertTask(ctx.project.id);
    expect(
      (
        await ctx.call("POST", `/milestone/feature/${leaf.id}`, {
          title: "Wrong owner",
        })
      ).status,
    ).toBe(409);
    for (const fields of [
      { title: " " },
      { title: "x".repeat(256) },
      { title: "Valid", description: "x".repeat(10_001) },
      { title: "Valid", endDate: "2026-02-30" },
      { title: "Valid", endDate: "0000-01-01" },
    ]) {
      expect(
        (await ctx.call("POST", `/milestone/feature/${ctx.feature.id}`, fields))
          .status,
      ).toBe(400);
    }
  });

  it("reorders exact sets and rejects duplicate, missing and foreign ids", async () => {
    const ctx = await setup();
    const a = await ctx.milestone();
    const b = await ctx.milestone();
    const response = await ctx.call(
      "PUT",
      `/milestone/feature/${ctx.feature.id}/order`,
      { milestoneIds: [b.id, a.id] },
    );
    expect(response.status).toBe(200);
    expect(
      (await response.json()).map((item: { id: string }) => item.id),
    ).toEqual([b.id, a.id]);
    expect(
      (
        await ctx.call("PUT", `/milestone/feature/${ctx.feature.id}/order`, {
          milestoneIds: [a.id, a.id],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ctx.call("PUT", `/milestone/feature/${ctx.feature.id}/order`, {
          milestoneIds: [a.id],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await ctx.call("PUT", `/milestone/feature/${ctx.feature.id}/order`, {
          milestoneIds: [a.id, "foreign"],
        })
      ).status,
    ).toBe(409);
  });

  it("creates Task and Bug members inheriting their milestone release", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    for (const type of ["task", "bug"]) {
      const response = await ctx.call("POST", `/task/${ctx.project.id}`, {
        title: type,
        description: "",
        priority: "low",
        status: "to-do",
        type,
        featureId: ctx.feature.id,
        milestoneId: milestone.id,
      });
      expect(response.status).toBe(200);
      const task = await response.json();
      expect(task).toMatchObject({
        type,
        featureId: ctx.feature.id,
        milestoneId: milestone.id,
        releaseId: ctx.release.id,
      });
      expect(
        await (await ctx.call("GET", `/task/${task.id}`)).json(),
      ).toMatchObject({ milestoneId: milestone.id });
      const relations = await (
        await ctx.call("GET", `/task-relation/${ctx.feature.id}`)
      ).json();
      expect(
        relations.find(
          (item: { targetTaskId: string }) => item.targetTaskId === task.id,
        ).targetTask.milestoneId,
      ).toBe(milestone.id);
    }
    const progress = await (
      await ctx.call("GET", `/milestone/${milestone.id}`)
    ).json();
    expect(progress.progress).toEqual({ total: 2, started: 0, completed: 0 });
    expect(
      (
        await ctx.call("POST", `/task/${ctx.project.id}`, {
          title: "Feature",
          description: "",
          priority: "low",
          status: "to-do",
          type: "feature",
          milestoneId: milestone.id,
        })
      ).status,
    ).toBe(400);
  });

  it("allows only leaves already in the milestone’s Feature and records assignment and clearing", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const task = await insertTask(ctx.project.id);
    expect(
      (
        await ctx.call("PATCH", `/task/${task.id}/milestone`, {
          milestoneId: milestone.id,
        })
      ).status,
    ).toBe(409);
    await ctx.call("PUT", `/task/feature/${task.id}`, {
      featureId: ctx.feature.id,
    });
    expect(
      (
        await ctx.call("PATCH", `/task/${ctx.feature.id}/milestone`, {
          milestoneId: milestone.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await ctx.call("PATCH", `/task/${task.id}/milestone`, {
          milestoneId: milestone.id,
        })
      ).status,
    ).toBe(200);
    expect((await row(task.id))?.milestoneId).toBe(milestone.id);
    expect(
      (
        await ctx.call("PATCH", `/task/${task.id}/milestone`, {
          milestoneId: null,
        })
      ).status,
    ).toBe(200);
    expect(await row(task.id)).toMatchObject({
      milestoneId: null,
      featureId: ctx.feature.id,
      releaseId: ctx.release.id,
    });
    const activities = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, task.id),
          eq(schema.activityTable.type, "milestone_changed"),
        ),
      );
    expect(activities.map((activity) => activity.eventData)).toEqual([
      expect.objectContaining({
        newMilestoneId: milestone.id,
        newMilestoneTitle: milestone.title,
        projectId: ctx.project.id,
      }),
      expect.objectContaining({
        oldMilestoneId: milestone.id,
        newMilestoneId: null,
      }),
    ]);
    const otherFeature = await insertTask(ctx.project.id, { type: "feature" });
    await ctx.call("PUT", `/task/feature/${task.id}`, {
      featureId: otherFeature.id,
    });
    expect(
      (
        await ctx.call("PATCH", `/task/${task.id}/milestone`, {
          milestoneId: milestone.id,
        })
      ).status,
    ).toBe(404);
  });

  it("counts all linked Task/Bug work including archives and responds to workflow edits", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    for (const [status, type] of [
      ["to-do", "task"],
      ["in-progress", "bug"],
      ["in-review", "task"],
      ["done", "bug"],
      ["planned", "task"],
      ["archived", "bug"],
      ["unknown", "task"],
    ] as const) {
      await insertTask(ctx.project.id, {
        type,
        status,
        featureId: ctx.feature.id,
        milestoneId: milestone.id,
      });
    }
    const read = async () =>
      (await (await ctx.call("GET", `/milestone/${milestone.id}`)).json())
        .progress;
    expect(await read()).toEqual({ total: 7, started: 3, completed: 1 });
    await db
      .update(schema.columnTable)
      .set({ isFinal: true })
      .where(eq(schema.columnTable.id, ctx.columns.inReview.id));
    expect(await read()).toEqual({ total: 7, started: 3, completed: 2 });
    await db
      .update(schema.columnTable)
      .set({ position: -1 })
      .where(eq(schema.columnTable.id, ctx.columns.inProgress.id));
    expect(await read()).toEqual({ total: 7, started: 3, completed: 2 });
  });

  it("filters Feature and milestone before pagination and preserves full progress", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const members = await Promise.all(
      [0, 1, 2].map(() =>
        insertTask(ctx.project.id, {
          type: "bug",
          featureId: ctx.feature.id,
          milestoneId: milestone.id,
        }),
      ),
    );
    const outside = await insertTask(ctx.project.id);
    const body = await (
      await ctx.call(
        "GET",
        `/task/tasks/${ctx.project.id}?featureId=${ctx.feature.id}&milestoneId=${milestone.id}&type=bug&limit=1&page=2`,
      )
    ).json();
    expect(body.pagination.total).toBe(3);
    expect(taskIds(body)).toHaveLength(1);
    expect(members.map((task) => task.id)).toContain(taskIds(body)[0]);
    const none = await (
      await ctx.call(
        "GET",
        `/task/tasks/${ctx.project.id}?featureId=none&milestoneId=none`,
      )
    ).json();
    expect(taskIds(none)).toContain(outside.id);
    expect(
      taskIds(none).some((id) => members.some((task) => task.id === id)),
    ).toBe(false);
    expect(
      (await (await ctx.call("GET", `/milestone/${milestone.id}`)).json())
        .progress.total,
    ).toBe(3);
  });

  it("preserves Task/Bug conversion and leaf duplication, clears on Feature changes and rejects promotion", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const leaf = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
      releaseId: ctx.release.id,
    });
    await db
      .update(schema.projectTable)
      .set({ lastTaskNumber: leaf.number ?? 1 })
      .where(eq(schema.projectTable.id, ctx.project.id));
    expect(
      (await ctx.call("PUT", `/task/type/${leaf.id}`, { type: "bug" })).status,
    ).toBe(200);
    expect(await row(leaf.id)).toMatchObject({
      type: "bug",
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
      releaseId: ctx.release.id,
    });
    const duplicate = await ctx.call("POST", `/task/duplicate/${leaf.id}`, {});
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({
      type: "bug",
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
      releaseId: ctx.release.id,
    });
    expect(
      (await ctx.call("PUT", `/task/feature/${leaf.id}`, { featureId: null }))
        .status,
    ).toBe(200);
    expect(await row(leaf.id)).toMatchObject({
      featureId: null,
      milestoneId: null,
      releaseId: ctx.release.id,
    });
    const promoted = await insertTask(ctx.project.id, {
      number: 100000,
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
    });
    expect(
      (await ctx.call("PUT", `/task/type/${promoted.id}`, { type: "feature" }))
        .status,
    ).toBe(400);
    expect(await row(promoted.id)).toMatchObject({
      type: "task",
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
    });
  });

  it("blocks all Feature conversion and duplicates Features without milestones", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    expect(
      (await ctx.call("PUT", `/task/type/${ctx.feature.id}`, { type: "task" }))
        .status,
    ).toBe(409);
    const duplicate = await (
      await ctx.call("POST", `/task/duplicate/${ctx.feature.id}`, {})
    ).json();
    expect(
      await (
        await ctx.call("GET", `/milestone/feature/${duplicate.id}`)
      ).json(),
    ).toEqual([]);
    expect(
      (await ctx.call("DELETE", `/milestone/${milestone.id}`)).status,
    ).toBe(200);
    expect(
      (await ctx.call("PUT", `/task/type/${ctx.feature.id}`, { type: "bug" }))
        .status,
    ).toBe(409);
  });

  it("clears milestone on a leaf move and keeps owned milestones when an empty Feature moves", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const target = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    const leaf = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
    });
    const moved = await ctx.call("PUT", `/task/move/${leaf.id}`, {
      destinationProjectId: target.project.id,
    });
    expect(moved.status).toBe(200);
    expect(await row(leaf.id)).toMatchObject({
      featureId: null,
      milestoneId: null,
      projectId: target.project.id,
    });
    expect(
      (
        await ctx.call("PUT", `/task/move/${ctx.feature.id}`, {
          destinationProjectId: target.project.id,
        })
      ).status,
    ).toBe(200);
    expect(
      await (await ctx.call("GET", `/milestone/${milestone.id}`)).json(),
    ).toMatchObject({ id: milestone.id, featureId: ctx.feature.id });
  });

  it("deletes milestones without changing Feature/Release or deleting linked work", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const leaf = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
      releaseId: ctx.release.id,
    });
    expect(
      (await ctx.call("DELETE", `/milestone/${milestone.id}`)).status,
    ).toBe(200);
    expect(await row(leaf.id)).toMatchObject({
      featureId: ctx.feature.id,
      milestoneId: null,
      releaseId: ctx.release.id,
    });
    expect((await ctx.call("GET", `/milestone/${milestone.id}`)).status).toBe(
      404,
    );
  });

  it("deletes Feature milestones while preserving children and their releases", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const leaf = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: ctx.feature.id,
      milestoneId: milestone.id,
      releaseId: ctx.release.id,
    });
    expect((await ctx.call("DELETE", `/task/${ctx.feature.id}`)).status).toBe(
      200,
    );
    expect(await row(leaf.id)).toMatchObject({
      featureId: null,
      milestoneId: null,
      releaseId: ctx.release.id,
    });
    expect(
      await db.query.milestoneTable.findFirst({
        where: eq(schema.milestoneTable.id, milestone.id),
      }),
    ).toBeUndefined();
  });

  it("rolls back membership and activity atomically", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const leaf = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
    });
    await expect(
      db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(schema.taskTable)
          .where(eq(schema.taskTable.id, leaf.id))
          .for("update");
        await setTaskMilestone(tx, locked!, milestone.id, ctx.user.id);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect((await row(leaf.id))?.milestoneId).toBeNull();
    const activities = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, leaf.id));
    expect(activities).toEqual([]);
  });

  it("serializes concurrent creation and safely resolves assignment racing deletion", async () => {
    const ctx = await setup();
    const created = await Promise.all([
      ctx.milestone("one"),
      ctx.milestone("two"),
      ctx.milestone("three"),
    ]);
    expect(created.map((item) => item.position).sort()).toEqual([0, 1, 2]);
    const milestone = created[0];
    const leaf = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
    });
    const [assignment, removal] = await Promise.all([
      ctx.call("PATCH", `/task/${leaf.id}/milestone`, {
        milestoneId: milestone.id,
      }),
      ctx.call("DELETE", `/milestone/${milestone.id}`),
    ]);
    expect([200, 404]).toContain(assignment.status);
    expect(removal.status).toBe(200);
    expect((await row(leaf.id))?.milestoneId).toBeNull();
  });

  it("serializes milestone creation against Feature conversion and assignment against promotion", async () => {
    const ctx = await setup();
    const [creation, conversion] = await Promise.all([
      ctx.call("POST", `/milestone/feature/${ctx.feature.id}`, {
        title: "Racing checkpoint",
      }),
      ctx.call("PUT", `/task/type/${ctx.feature.id}`, { type: "task" }),
    ]);
    expect([creation.status, conversion.status]).toEqual([200, 409]);
    const owner = await row(ctx.feature.id);
    const owned = await db
      .select()
      .from(schema.milestoneTable)
      .where(eq(schema.milestoneTable.featureId, ctx.feature.id));
    expect(owned.length).toBe(owner?.type === "feature" ? 1 : 0);
    const feature =
      owner?.type === "feature"
        ? owner
        : await insertTask(ctx.project.id, { type: "feature" });
    const [milestone] = owned.length
      ? owned
      : await db
          .insert(schema.milestoneTable)
          .values({ featureId: feature.id, title: "Promotion race" })
          .returning();
    const task = await insertTask(ctx.project.id, { featureId: feature.id });
    const [assignment, promotion] = await Promise.all([
      ctx.call("PATCH", `/task/${task.id}/milestone`, {
        milestoneId: milestone!.id,
      }),
      ctx.call("PUT", `/task/type/${task.id}`, { type: "feature" }),
    ]);
    expect(assignment.status).toBe(200);
    expect(promotion.status).toBe(400);
    expect(await row(task.id)).toMatchObject({
      type: "task",
      featureId: feature.id,
      milestoneId: milestone!.id,
    });
  });

  it("leaves release history unchanged on milestone operations and totals stable on Task/Bug conversion", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const leaf = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: ctx.feature.id,
      releaseId: ctx.release.id,
    });
    const before = await db
      .select()
      .from(schema.releaseProgressEventTable)
      .where(eq(schema.releaseProgressEventTable.releaseId, ctx.release.id));
    await ctx.call("PATCH", `/task/${leaf.id}/milestone`, {
      milestoneId: milestone.id,
    });
    await ctx.call("PATCH", `/milestone/${milestone.id}`, { title: "Updated" });
    await ctx.call("DELETE", `/milestone/${milestone.id}`);
    const after = await db
      .select()
      .from(schema.releaseProgressEventTable)
      .where(eq(schema.releaseProgressEventTable.releaseId, ctx.release.id));
    expect(after).toEqual(before);
    await ctx.call("PUT", `/task/type/${leaf.id}`, { type: "task" });
    const converted = await db
      .select()
      .from(schema.releaseProgressEventTable)
      .where(eq(schema.releaseProgressEventTable.releaseId, ctx.release.id));
    expect(converted.reduce((total, event) => total + event.delta, 0)).toBe(
      before.reduce((total, event) => total + event.delta, 0),
    );
    const counts = await db.execute(
      sql`select count(*)::int as total from task where release_id = ${ctx.release.id} and type in ('task','bug')`,
    );
    expect(counts.rows[0]?.total).toBe(1);
  });

  it("rejects stale authorized scope after a Feature or leaf changes projects", async () => {
    const ctx = await setup();
    const milestone = await ctx.milestone();
    const target = await createProjectFixture({
      workspaceId: ctx.workspace.id,
    });
    expect(
      (
        await ctx.call("PUT", `/task/move/${ctx.feature.id}`, {
          destinationProjectId: target.project.id,
        })
      ).status,
    ).toBe(200);
    const conflict = { status: 409 };
    await expect(
      db.transaction((tx) => readMilestone(milestone.id, tx, ctx.project.id)),
    ).rejects.toMatchObject(conflict);
    await expect(
      db.transaction((tx) =>
        readMilestones(ctx.feature.id, tx, ctx.project.id),
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      createMilestone(
        ctx.feature.id,
        { title: "Stale" },
        ctx.user.id,
        ctx.project.id,
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      updateMilestone(
        milestone.id,
        { title: "Stale" },
        ctx.user.id,
        ctx.project.id,
      ),
    ).rejects.toMatchObject(conflict);
    await expect(
      deleteMilestone(milestone.id, ctx.user.id, ctx.project.id),
    ).rejects.toMatchObject(conflict);
    await expect(
      reorderMilestones(
        ctx.feature.id,
        [milestone.id],
        ctx.user.id,
        ctx.project.id,
      ),
    ).rejects.toMatchObject(conflict);
    const leaf = await insertTask(target.project.id);
    await expect(
      updateTaskMilestone({
        id: leaf.id,
        milestoneId: null,
        currentUserId: ctx.user.id,
        expectedProjectId: ctx.project.id,
      }),
    ).rejects.toMatchObject(conflict);
    expect((await ctx.call("GET", `/milestone/${milestone.id}`)).status).toBe(
      200,
    );
  });

  it("enforces project boundaries for reads, mutation and cross-project membership", async () => {
    const ctx = await createRestrictedWorkspace();
    const feature = await insertTask(ctx.beta.id, { type: "feature" });
    const [milestone] = await db
      .insert(schema.milestoneTable)
      .values({ featureId: feature.id, title: "Private" })
      .returning();
    mockAuthenticatedSession(ctx.restricted);
    const app = createApp().app;
    for (const path of [
      `/milestone/feature/${feature.id}`,
      `/milestone/${milestone!.id}`,
    ]) {
      expect((await app.request(`/api${path}`)).status).toBe(403);
    }
    expect(
      (
        await app.request(
          `/api/milestone/${milestone!.id}`,
          jsonRequest("PATCH", { title: "No" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          `/api/task/${ctx.alphaTask.id}/milestone`,
          jsonRequest("PATCH", { milestoneId: milestone!.id }),
        )
      ).status,
    ).toBe(409);
  });
});
