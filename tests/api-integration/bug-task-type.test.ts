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
  return { ...member, ...fixture, release, feature, app: createApp().app };
}

describe("Bug items", () => {
  it("creates bugs in a feature with inherited release and the normal task permissions", async () => {
    const ctx = await setup();
    const response = await ctx.app.request(
      `/api/task/${ctx.project.id}`,
      jsonRequest("POST", {
        title: "Deployment bug",
        description: "",
        type: "bug",
        status: "in-progress",
        priority: "high",
        featureId: ctx.feature.id,
        userId: ctx.user.id,
      }),
    );
    expect(response.status).toBe(200);
    const bug = await response.json();
    expect(bug).toMatchObject({
      type: "bug",
      featureId: ctx.feature.id,
      releaseId: ctx.release.id,
      columnId: ctx.columns.inProgress.id,
    });
    const relations = await (
      await ctx.app.request(`/api/task-relation/${bug.id}`)
    ).json();
    expect(relations).toEqual([
      expect.objectContaining({
        relationType: "subtask",
        sourceTask: expect.objectContaining({ type: "feature" }),
        targetTask: expect.objectContaining({ type: "bug" }),
      }),
    ]);
    const feature = await (
      await ctx.app.request(`/api/task/${ctx.feature.id}?view=board`)
    ).json();
    expect(feature.subtaskCounts).toEqual({ total: 1, completed: 0 });
    const assigned = await (
      await ctx.app.request(
        `/api/task/assigned?workspaceId=${ctx.workspace.id}`,
      )
    ).json();
    expect(
      assigned.tasks.find((task: { id: string }) => task.id === bug.id),
    ).toMatchObject({ type: "bug" });
    for (const query of ["Deployment", `${ctx.project.slug}-${bug.number}`]) {
      const search = await (
        await ctx.app.request(
          `/api/search?q=${encodeURIComponent(query)}&workspaceId=${ctx.workspace.id}&type=tasks`,
        )
      ).json();
      expect(
        search.results.find((result: { id: string }) => result.id === bug.id),
      ).toMatchObject({ type: "task", taskType: "bug" });
    }
  });

  it("preserves feature and release while switching Task and Bug, but clears the parent on promotion", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, {
      featureId: ctx.feature.id,
      releaseId: ctx.release.id,
      title: "Preserved title",
      description: "Preserved description",
      priority: "high",
      status: "in-review",
      userId: ctx.user.id,
    });
    const [comment] = await db
      .insert(schema.activityTable)
      .values({
        taskId: task.id,
        userId: ctx.user.id,
        type: "comment",
        content: "Preserved comment",
      })
      .returning();
    const [relation] = await db
      .insert(schema.taskRelationTable)
      .values({
        sourceTaskId: task.id,
        targetTaskId: ctx.feature.id,
        relationType: "blocks",
      })
      .returning();
    for (const type of ["bug", "task", "bug"]) {
      const response = await ctx.app.request(
        `/api/task/type/${task.id}`,
        jsonRequest("PUT", { type }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        type,
        featureId: ctx.feature.id,
        releaseId: ctx.release.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        userId: task.userId,
        number: task.number,
      });
    }
    const promoted = await ctx.app.request(
      `/api/task/type/${task.id}`,
      jsonRequest("PUT", { type: "feature" }),
    );
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toMatchObject({
      type: "feature",
      featureId: null,
      releaseId: ctx.release.id,
    });
    const demoted = await ctx.app.request(
      `/api/task/type/${task.id}`,
      jsonRequest("PUT", { type: "bug" }),
    );
    expect(demoted.status).toBe(200);
    expect(await demoted.json()).toMatchObject({
      type: "bug",
      featureId: null,
      releaseId: ctx.release.id,
    });
    expect(
      await db
        .select()
        .from(schema.activityTable)
        .where(eq(schema.activityTable.id, comment!.id)),
    ).toEqual([comment]);
    expect(
      await db
        .select()
        .from(schema.taskRelationTable)
        .where(eq(schema.taskRelationTable.id, relation!.id)),
    ).toEqual([relation]);
  });

  it.each(["task", "bug"])(
    "rejects feature conversion to %s while any bug belongs to it",
    async (type) => {
      const ctx = await setup();
      await insertTask(ctx.project.id, {
        type: "bug",
        featureId: ctx.feature.id,
      });
      expect(
        (
          await ctx.app.request(
            `/api/task/type/${ctx.feature.id}`,
            jsonRequest("PUT", { type }),
          )
        ).status,
      ).toBe(409);
    },
  );

  it("filters exact types before pagination without changing unfiltered feature counts", async () => {
    const ctx = await setup();
    const bug = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: ctx.feature.id,
      status: "done",
    });
    await insertTask(ctx.project.id, {
      type: "bug",
      featureId: ctx.feature.id,
    });
    await insertTask(ctx.project.id, { featureId: ctx.feature.id });
    const page = await (
      await ctx.app.request(
        `/api/task/tasks/${ctx.project.id}?type=bug&limit=1&sortBy=number`,
      )
    ).json();
    expect(page.pagination).toMatchObject({ total: 2, totalPages: 2 });
    expect(
      page.data.columns.flatMap(
        (column: { tasks: Array<{ id: string; type: string }> }) =>
          column.tasks,
      ),
    ).toEqual([expect.objectContaining({ id: bug.id, type: "bug" })]);
    const plain = await (
      await ctx.app.request(`/api/task/tasks/${ctx.project.id}?type=task`)
    ).json();
    expect(plain.pagination.total).toBe(1);
    const features = await (
      await ctx.app.request(`/api/task/tasks/${ctx.project.id}?type=feature`)
    ).json();
    expect(
      features.data.columns.flatMap(
        (column: { tasks: unknown[] }) => column.tasks,
      )[0],
    ).toMatchObject({ subtaskCounts: { total: 3, completed: 1 } });
    expect(
      (await ctx.app.request(`/api/task/tasks/${ctx.project.id}?type=defect`))
        .status,
    ).toBe(400);
  });

  it("preserves Bug classification on duplicate and project move", async () => {
    const ctx = await setup();
    const bug = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: ctx.feature.id,
      releaseId: ctx.release.id,
    });
    await db
      .update(schema.projectTable)
      .set({ lastTaskNumber: bug.number ?? 1 })
      .where(eq(schema.projectTable.id, ctx.project.id));
    const copied = await ctx.app.request(
      `/api/task/duplicate/${bug.id}`,
      jsonRequest("POST", {}),
    );
    expect(copied.status).toBe(200);
    expect(await copied.json()).toMatchObject({
      type: "bug",
      featureId: ctx.feature.id,
      releaseId: ctx.release.id,
    });
    const other = await createProjectFixture({ workspaceId: ctx.workspace.id });
    const moved = await ctx.app.request(
      `/api/task/move/${bug.id}`,
      jsonRequest("PUT", { destinationProjectId: other.project.id }),
    );
    expect(moved.status).toBe(200);
    expect((await moved.json()).task).toMatchObject({
      type: "bug",
      featureId: null,
      releaseId: null,
      projectId: other.project.id,
    });
  });

  it("keeps project access checks on Bug creation and conversion", async () => {
    const ctx = await createRestrictedWorkspace();
    const bug = await insertTask(ctx.beta.id, { type: "bug" });
    mockAuthenticatedSession(ctx.restricted);
    const { app } = createApp();
    expect(
      (
        await app.request(
          `/api/task/${ctx.beta.id}`,
          jsonRequest("POST", {
            title: "Private bug",
            description: "",
            type: "bug",
            status: "to-do",
            priority: "low",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          `/api/task/type/${bug.id}`,
          jsonRequest("PUT", { type: "task" }),
        )
      ).status,
    ).toBe(403);
  });

  it("serializes joining a feature against its conversion to Bug", async () => {
    const ctx = await setup();
    const bug = await insertTask(ctx.project.id, { type: "bug" });
    const responses = await Promise.all([
      ctx.app.request(
        `/api/task/type/${ctx.feature.id}`,
        jsonRequest("PUT", { type: "bug" }),
      ),
      ctx.app.request(
        `/api/task/feature/${bug.id}`,
        jsonRequest("PUT", { featureId: ctx.feature.id }),
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const rows = await db.select().from(schema.taskTable);
    const parent = rows.find((row) => row.id === ctx.feature.id)!;
    const child = rows.find((row) => row.id === bug.id)!;
    expect(child.featureId === null || parent.type === "feature").toBe(true);
  });
});
