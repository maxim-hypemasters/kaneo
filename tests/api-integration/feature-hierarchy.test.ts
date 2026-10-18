import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { recordFeatureDeletion } from "../../apps/api/src/task/feature-hierarchy/record-feature-deletion";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

function call(method: string, path: string, body?: unknown) {
  return createApp().app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

let numbers = 0;
async function addTask(
  projectId: string,
  values: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  numbers += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId, title: `Task ${numbers}`, number: numbers, ...values })
    .returning();
  return task;
}

async function read(id: string) {
  return db.query.taskTable.findFirst({ where: eq(schema.taskTable.id, id) });
}

async function featureChanges(taskId: string) {
  const rows = await db
    .select({ eventData: schema.activityTable.eventData })
    .from(schema.activityTable)
    .where(
      and(
        eq(schema.activityTable.taskId, taskId),
        eq(schema.activityTable.type, "feature_changed"),
      ),
    );
  return rows.map((row) => row.eventData);
}

async function setup(role?: "admin") {
  const member = await createWorkspaceMember(role ? { role } : undefined);
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const { project: otherProject } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const feature = await addTask(project.id, {
    type: "feature",
    title: "Checkout",
  });
  const task = await addTask(project.id);
  mockAuthenticatedSession(member.user);
  return { ...member, project, columns, otherProject, feature, task };
}

describe("feature membership", () => {
  it("puts a task into a feature, records it, and takes it out again", async () => {
    const ctx = await setup();

    const joined = await call("PUT", `/task/feature/${ctx.task.id}`, {
      featureId: ctx.feature.id,
    });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toMatchObject({ featureId: ctx.feature.id });
    const [activity] = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, ctx.task.id),
          eq(schema.activityTable.type, "feature_changed"),
        ),
      );
    expect(activity?.eventData).toMatchObject({
      projectId: ctx.project.id,
      oldFeatureId: null,
      newFeatureId: ctx.feature.id,
      newFeatureTitle: "Checkout",
    });

    const board = await (
      await call("GET", `/task/tasks/${ctx.project.id}`)
    ).json();
    const cards = board.data.columns.flatMap(
      (column: { tasks: unknown[] }) => column.tasks,
    );
    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ctx.feature.id,
          type: "feature",
          subtaskCounts: { completed: 0, total: 1 },
        }),
        expect.objectContaining({ id: ctx.task.id, featureId: ctx.feature.id }),
      ]),
    );

    const left = await call("PUT", `/task/feature/${ctx.task.id}`, {
      featureId: null,
    });
    expect(left.status).toBe(200);
    expect((await read(ctx.task.id))?.featureId).toBeNull();
  });

  it("only joins a feature of the task's own project, and never nests features", async () => {
    const ctx = await setup();
    const plain = await addTask(ctx.project.id);
    const second = await addTask(ctx.project.id, { type: "feature" });

    for (const [taskId, featureId, message] of [
      [ctx.task.id, plain.id, "That task isn't a feature"],
      [second.id, ctx.feature.id, "A feature can't belong to another feature"],
    ]) {
      const response = await call("PUT", `/task/feature/${taskId}`, {
        featureId,
      });
      expect(response.status).toBe(409);
      expect((await readErrorBody(response)).message).toBe(message);
    }
  });

  it("reads a task outside the project as a missing feature, whatever it is", async () => {
    const ctx = await setup();
    const elsewhere = await addTask(ctx.otherProject.id, { type: "feature" });
    const plainElsewhere = await addTask(ctx.otherProject.id);
    const foreign = await createWorkspaceMember();
    const { project: foreignProject } = await createProjectFixture({
      workspaceId: foreign.workspace.id,
    });
    const foreignFeature = await addTask(foreignProject.id, {
      type: "feature",
    });
    const foreignTask = await addTask(foreignProject.id);

    for (const featureId of [
      elsewhere.id,
      plainElsewhere.id,
      foreignFeature.id,
      foreignTask.id,
      "nope",
    ]) {
      const joined = await call("PUT", `/task/feature/${ctx.task.id}`, {
        featureId,
      });
      expect(joined.status).toBe(404);
      expect((await readErrorBody(joined)).message).toBe("Feature not found");

      const created = await call("POST", `/task/${ctx.project.id}`, {
        title: "Into a foreign feature",
        description: "",
        priority: "low",
        status: "to-do",
        featureId,
      });
      expect(created.status).toBe(404);
      expect((await readErrorBody(created)).message).toBe("Feature not found");
    }
    expect((await read(ctx.task.id))?.featureId).toBeNull();
  });

  it("refuses an empty feature id as invalid", async () => {
    const ctx = await setup();

    const joined = await call("PUT", `/task/feature/${ctx.task.id}`, {
      featureId: "",
    });
    expect(joined.status).toBe(400);
    const created = await call("POST", `/task/${ctx.project.id}`, {
      title: "No feature",
      description: "",
      priority: "low",
      status: "to-do",
      featureId: "",
    });
    expect(created.status).toBe(400);
  });

  it("creates a task straight into a feature", async () => {
    const ctx = await setup();

    const created = await call("POST", `/task/${ctx.project.id}`, {
      title: "Payment form",
      description: "",
      priority: "low",
      status: "to-do",
      featureId: ctx.feature.id,
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      type: "task",
      featureId: ctx.feature.id,
    });

    const nested = await call("POST", `/task/${ctx.project.id}`, {
      title: "Nested",
      description: "",
      priority: "low",
      status: "to-do",
      type: "feature",
      featureId: ctx.feature.id,
    });
    expect(nested.status).toBe(400);
    const intoTask = await call("POST", `/task/${ctx.project.id}`, {
      title: "Into a task",
      description: "",
      priority: "low",
      status: "to-do",
      featureId: ctx.task.id,
    });
    expect(intoTask.status).toBe(409);
  });

  it("records a created feature as created", async () => {
    const ctx = await setup();

    const response = await call("POST", `/task/${ctx.project.id}`, {
      title: "Search",
      description: "",
      priority: "low",
      status: "to-do",
      type: "feature",
    });
    const feature = (await response.json()) as { id: string; type: string };
    expect(feature.type).toBe("feature");
    // The event spreads the task row, whose own type mustn't win.
    await vi.waitFor(async () => {
      const activities = await db
        .select({ type: schema.activityTable.type })
        .from(schema.activityTable)
        .where(eq(schema.activityTable.taskId, feature.id));
      expect(activities.map((activity) => activity.type)).toEqual(["created"]);
    });
  });
});

describe("task type", () => {
  it("makes a task a feature, leaving its own feature", async () => {
    const ctx = await setup();
    await db
      .update(schema.taskTable)
      .set({ featureId: ctx.feature.id })
      .where(eq(schema.taskTable.id, ctx.task.id));

    const response = await call("PUT", `/task/type/${ctx.task.id}`, {
      type: "feature",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      type: "feature",
      featureId: null,
    });
  });

  it("turns a feature back into a task only once it has no tasks", async () => {
    const ctx = await setup();
    await db
      .update(schema.taskTable)
      .set({ featureId: ctx.feature.id })
      .where(eq(schema.taskTable.id, ctx.task.id));

    const refused = await call("PUT", `/task/type/${ctx.feature.id}`, {
      type: "task",
    });
    expect(refused.status).toBe(409);

    await call("PUT", `/task/feature/${ctx.task.id}`, { featureId: null });
    const allowed = await call("PUT", `/task/type/${ctx.feature.id}`, {
      type: "task",
    });
    expect(allowed.status).toBe(200);
    expect((await read(ctx.feature.id))?.type).toBe("task");
  });
});

describe("feature lifecycle", () => {
  it("records it on the tasks when a bulk delete removes their feature", async () => {
    const ctx = await setup("admin");
    const deletedToo = await addTask(ctx.project.id, {
      featureId: ctx.feature.id,
    });
    await db
      .update(schema.taskTable)
      .set({ featureId: ctx.feature.id })
      .where(eq(schema.taskTable.id, ctx.task.id));

    const response = await call("PATCH", "/task/bulk", {
      taskIds: [ctx.feature.id, deletedToo.id],
      operation: "delete",
    });

    expect(response.status).toBe(200);
    expect(await read(ctx.task.id)).toMatchObject({ featureId: null });
    expect(await featureChanges(ctx.task.id)).toEqual([
      expect.objectContaining({
        oldFeatureId: ctx.feature.id,
        newFeatureId: null,
      }),
    ]);
  });

  it("unlinks a deleted feature's tasks without deleting them, and records it", async () => {
    const ctx = await setup("admin");
    const second = await addTask(ctx.project.id);
    await db
      .update(schema.taskTable)
      .set({ featureId: ctx.feature.id })
      .where(inArray(schema.taskTable.id, [ctx.task.id, second.id]));

    expect((await call("DELETE", `/task/${ctx.feature.id}`)).status).toBe(200);

    expect(await read(ctx.task.id)).toMatchObject({ featureId: null });
    expect(await read(second.id)).toMatchObject({ featureId: null });
    for (const taskId of [ctx.task.id, second.id]) {
      expect(await featureChanges(taskId)).toEqual([
        {
          projectId: ctx.project.id,
          oldFeatureId: ctx.feature.id,
          oldFeatureTitle: "Checkout",
          newFeatureId: null,
          newFeatureTitle: null,
        },
      ]);
    }
  });

  it("records nothing for a task deleted along with its feature", async () => {
    const ctx = await setup();
    const kept = await addTask(ctx.project.id, { featureId: ctx.feature.id });
    await db
      .update(schema.taskTable)
      .set({ featureId: ctx.feature.id })
      .where(eq(schema.taskTable.id, ctx.task.id));

    await db.transaction((tx) =>
      recordFeatureDeletion(tx, [ctx.feature.id, ctx.task.id], ctx.user.id),
    );

    expect(await featureChanges(ctx.task.id)).toEqual([]);
    expect(await featureChanges(kept.id)).toEqual([
      expect.objectContaining({ oldFeatureId: ctx.feature.id }),
    ]);
  });

  it("takes a moved task out of its feature, and won't move a feature with tasks", async () => {
    const ctx = await setup();
    await db
      .update(schema.taskTable)
      .set({ featureId: ctx.feature.id })
      .where(eq(schema.taskTable.id, ctx.task.id));

    const blocked = await call("PUT", `/task/move/${ctx.feature.id}`, {
      destinationProjectId: ctx.otherProject.id,
    });
    expect(blocked.status).toBe(409);

    const moved = await call("PUT", `/task/move/${ctx.task.id}`, {
      destinationProjectId: ctx.otherProject.id,
    });
    expect(moved.status).toBe(200);
    expect(await read(ctx.task.id)).toMatchObject({
      projectId: ctx.otherProject.id,
      featureId: null,
    });
    expect(await featureChanges(ctx.task.id)).toEqual([
      {
        projectId: ctx.project.id,
        oldFeatureId: ctx.feature.id,
        oldFeatureTitle: "Checkout",
        newFeatureId: null,
        newFeatureTitle: null,
      },
    ]);
    expect(await featureChanges(ctx.feature.id)).toEqual([]);
  });
});

describe("subtask relations from older clients", () => {
  it("puts the subtask into the parent's feature, making a plain parent a feature", async () => {
    const ctx = await setup();
    const parent = await addTask(ctx.project.id);

    const created = await call("POST", "/task-relation", {
      sourceTaskId: parent.id,
      targetTaskId: ctx.task.id,
      relationType: "subtask",
    });

    expect(created.status).toBe(200);
    const link = await created.json();
    expect(link).toMatchObject({
      id: `feature:${ctx.task.id}:${parent.id}`,
      sourceTaskId: parent.id,
      targetTaskId: ctx.task.id,
      relationType: "subtask",
    });
    expect(await read(parent.id)).toMatchObject({ type: "feature" });
    expect(await read(ctx.task.id)).toMatchObject({ featureId: parent.id });

    const relations = await (
      await call("GET", `/task-relation/${ctx.task.id}`)
    ).json();
    expect(relations).toEqual([
      expect.objectContaining({ id: link.id, relationType: "subtask" }),
    ]);

    expect((await call("DELETE", `/task-relation/${link.id}`)).status).toBe(
      200,
    );
    expect(await read(ctx.task.id)).toMatchObject({ featureId: null });
  });

  it("hands a subtask of a feature's task to that feature, keeping a related link", async () => {
    const ctx = await setup();
    await db
      .update(schema.taskTable)
      .set({ featureId: ctx.feature.id })
      .where(eq(schema.taskTable.id, ctx.task.id));
    const child = await addTask(ctx.project.id);

    const created = await call("POST", "/task-relation", {
      sourceTaskId: ctx.task.id,
      targetTaskId: child.id,
      relationType: "subtask",
    });

    expect(created.status).toBe(200);
    expect(await read(child.id)).toMatchObject({ featureId: ctx.feature.id });
    const related = await db.query.taskRelationTable.findMany({
      where: eq(schema.taskRelationTable.relationType, "related"),
    });
    expect(related).toMatchObject([
      { sourceTaskId: ctx.task.id, targetTaskId: child.id },
    ]);
  });

  it("refuses links across projects and into features", async () => {
    const ctx = await setup();
    const elsewhere = await addTask(ctx.otherProject.id);

    for (const [sourceTaskId, targetTaskId] of [
      [ctx.feature.id, elsewhere.id],
      [ctx.task.id, ctx.feature.id],
    ]) {
      const response = await call("POST", "/task-relation", {
        sourceTaskId,
        targetTaskId,
        relationType: "subtask",
      });
      expect(response.status).toBe(409);
    }
  });

  it("deletes a link that no longer holds without changing anything", async () => {
    const ctx = await setup();
    const newer = await addTask(ctx.project.id, { type: "feature" });
    await db
      .update(schema.taskTable)
      .set({ featureId: newer.id })
      .where(eq(schema.taskTable.id, ctx.task.id));

    // An older tab "moves" the task by linking the new parent, then deleting
    // its old link.
    const stale = await call(
      "DELETE",
      `/task-relation/feature:${ctx.task.id}:${ctx.feature.id}`,
    );

    expect(stale.status).toBe(200);
    expect(await read(ctx.task.id)).toMatchObject({ featureId: newer.id });
  });
});

describe("listing a project's features", () => {
  it("returns only the project's features, by title", async () => {
    const ctx = await setup();
    const second = await addTask(ctx.project.id, {
      type: "feature",
      title: "Billing",
      status: "planned",
    });
    await addTask(ctx.otherProject.id, { type: "feature", title: "Elsewhere" });

    const response = await call("GET", `/task/features/${ctx.project.id}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: second.id,
        title: "Billing",
        number: second.number,
        status: "planned",
        releaseId: null,
      },
      {
        id: ctx.feature.id,
        title: "Checkout",
        number: ctx.feature.number,
        status: ctx.feature.status,
        releaseId: null,
      },
    ]);
  });

  it("refuses a project the caller can't see", async () => {
    const ctx = await setup();
    const stranger = await createWorkspaceMember();
    mockAuthenticatedSession(stranger.user);

    const response = await call("GET", `/task/features/${ctx.project.id}`);

    expect([403, 404]).toContain(response.status);
  });
});
