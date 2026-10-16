import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import updateColumn from "../../apps/api/src/column/controllers/update-column";
import db, { schema } from "../../apps/api/src/database";
import { eventContext } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { getPublicProject } from "../../apps/api/src/project/controllers/get-public-project";
import deleteTask from "../../apps/api/src/task/controllers/delete-task";
import getTasks from "../../apps/api/src/task/controllers/get-tasks";
import updateTaskFeature from "../../apps/api/src/task/controllers/update-task-feature";
import updateTaskStatus from "../../apps/api/src/task/controllers/update-task-status";
import {
  addConnection,
  initializeWebSocketAdapter,
  removeConnection,
  shutdownWebSocketAdapter,
} from "../../apps/api/src/ws";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

let numbers = 0;
async function addTask(
  projectId: string,
  status = "to-do",
  values: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  numbers += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId, title: "Task", status, number: numbers, ...values })
    .returning();
  return task;
}

const addFeature = (projectId: string, status = "to-do") =>
  addTask(projectId, status, { type: "feature" });

async function countsFor(projectId: string, taskId: string) {
  const { data } = await getTasks(projectId);
  return [
    ...data.columns.flatMap((c) => c.tasks),
    ...data.plannedTasks,
    ...data.archivedTasks,
  ].find((task) => task.id === taskId)?.subtaskCounts;
}

async function setup() {
  const member = await createWorkspaceMember();
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { ...member, ...fixture };
}

describe("feature progress", () => {
  beforeEach(resetTestDatabase);

  it("counts a feature's tasks whatever the board's filters and pages", async () => {
    const ctx = await setup();
    const feature = await addFeature(ctx.project.id);
    // Outside the status filter below, so the feature is the page's one task.
    const plain = await addTask(ctx.project.id, "in-review");
    await addTask(ctx.project.id, "done", { featureId: feature.id });
    await addTask(ctx.project.id, "in-progress", { featureId: feature.id });

    mockAuthenticatedSession(ctx.user);
    const response = await createApp().app.request(
      `/api/task/tasks/${ctx.project.id}?status=to-do&limit=1&page=1`,
    );
    expect(response.status).toBe(200);
    const tasks = (await response.json()).data.columns.flatMap(
      (column: { tasks: unknown[] }) => column.tasks,
    );
    expect(tasks).toEqual([
      expect.objectContaining({
        id: feature.id,
        subtaskCounts: { completed: 1, total: 2 },
      }),
    ]);
    expect(await countsFor(ctx.project.id, plain.id)).toEqual({
      completed: 0,
      total: 0,
    });
  });

  it("counts final columns, and planned and archived tasks, for planned and archived features too", async () => {
    const ctx = await setup();
    await db
      .update(schema.columnTable)
      .set({ isFinal: false })
      .where(eq(schema.columnTable.id, ctx.columns.done.id));
    await db.insert(schema.columnTable).values({
      projectId: ctx.project.id,
      name: "Shipped",
      slug: "shipped",
      isFinal: true,
    });
    const feature = await addFeature(ctx.project.id, "planned");
    for (const status of ["shipped", "done", "planned", "archived"]) {
      await addTask(ctx.project.id, status, { featureId: feature.id });
    }

    expect(await countsFor(ctx.project.id, feature.id)).toEqual({
      completed: 1,
      total: 4,
    });
    await db
      .update(schema.taskTable)
      .set({ status: "archived" })
      .where(eq(schema.taskTable.id, feature.id));
    expect(await countsFor(ctx.project.id, feature.id)).toEqual({
      completed: 1,
      total: 4,
    });
  });

  it("follows completion, reopening, leaving the feature and deletion", async () => {
    const ctx = await setup();
    const feature = await addFeature(ctx.project.id);
    const task = await addTask(ctx.project.id, "to-do", {
      featureId: feature.id,
    });
    const step = async (expected: { completed: number; total: number }) =>
      expect(await countsFor(ctx.project.id, feature.id)).toEqual(expected);

    await step({ completed: 0, total: 1 });
    await updateTaskStatus({
      id: task.id,
      status: "done",
      currentUserId: ctx.user.id,
    });
    await step({ completed: 1, total: 1 });
    await updateTaskStatus({
      id: task.id,
      status: "to-do",
      currentUserId: ctx.user.id,
    });
    await step({ completed: 0, total: 1 });
    await updateTaskFeature({
      id: task.id,
      featureId: null,
      currentUserId: ctx.user.id,
    });
    await step({ completed: 0, total: 0 });
    await updateTaskFeature({
      id: task.id,
      featureId: feature.id,
      currentUserId: ctx.user.id,
    });
    await deleteTask(task.id, ctx.user.id);
    await step({ completed: 0, total: 0 });
  });

  it("shows feature progress on a public board", async () => {
    const ctx = await setup();
    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, ctx.project.id));
    const feature = await addFeature(ctx.project.id);
    await addTask(ctx.project.id, "done", { featureId: feature.id });

    const board = await getPublicProject(ctx.project.id);
    expect(
      board.columns
        .flatMap((column) => column.tasks)
        .find((task) => task.id === feature.id),
    ).toMatchObject({
      type: "feature",
      subtaskCounts: { completed: 1, total: 1 },
    });
  });
});

describe("live feature progress", () => {
  beforeEach(resetTestDatabase);

  async function watch(projectId: string, userId: string, workspaceId: string) {
    await initializeWebSocketAdapter();
    const send = vi.fn();
    const connection = addConnection(
      projectId,
      { send } as never,
      userId,
      "watching-window",
      workspaceId,
    );
    const messages = () =>
      send.mock.calls.map(([message]) => JSON.parse(message as string));
    return {
      messages,
      clear: () => send.mockClear(),
      stop: async () => {
        removeConnection(projectId, connection);
        await shutdownWebSocketAdapter();
      },
    };
  }

  const fromOtherWindow = <T>(run: () => Promise<T>) =>
    eventContext.run({ initiatorId: "other-window" }, run);

  it("refreshes the board when a feature's task is completed or its column changes", async () => {
    const ctx = await setup();
    const feature = await addFeature(ctx.project.id);
    const task = await addTask(ctx.project.id, "to-do", {
      featureId: feature.id,
    });
    const socket = await watch(ctx.project.id, ctx.user.id, ctx.workspace.id);
    try {
      await fromOtherWindow(() =>
        updateTaskStatus({
          id: task.id,
          status: "done",
          currentUserId: ctx.user.id,
        }),
      );
      await vi.waitFor(() =>
        expect(socket.messages()).toContainEqual(
          expect.objectContaining({ type: "TASK_RELATION_UPDATED" }),
        ),
      );
      socket.clear();
      await fromOtherWindow(() =>
        updateColumn(ctx.columns.inProgress.id, { isFinal: true }),
      );
      await vi.waitFor(() =>
        expect(socket.messages()).toContainEqual(
          expect.objectContaining({ type: "TASK_RELATION_UPDATED" }),
        ),
      );
    } finally {
      await socket.stop();
    }
  });

  it("updates the feature's card when one of its tasks is deleted", async () => {
    const ctx = await setup();
    const feature = await addFeature(ctx.project.id);
    const task = await addTask(ctx.project.id, "to-do", {
      featureId: feature.id,
    });
    const socket = await watch(ctx.project.id, ctx.user.id, ctx.workspace.id);
    try {
      await fromOtherWindow(() => deleteTask(task.id, ctx.user.id));
      await vi.waitFor(() =>
        expect(socket.messages()).toContainEqual(
          expect.objectContaining({ type: "TASK_UPDATED", taskId: feature.id }),
        ),
      );
    } finally {
      await socket.stop();
    }
  });

  it("refreshes the board when a feature is deleted, freeing its tasks", async () => {
    const ctx = await setup();
    const feature = await addFeature(ctx.project.id);
    await addTask(ctx.project.id, "to-do", { featureId: feature.id });
    const socket = await watch(ctx.project.id, ctx.user.id, ctx.workspace.id);
    try {
      await fromOtherWindow(() => deleteTask(feature.id, ctx.user.id));
      await vi.waitFor(() =>
        expect(socket.messages()).toContainEqual(
          expect.objectContaining({ type: "TASK_RELATION_UPDATED" }),
        ),
      );
    } finally {
      await socket.stop();
    }
  });
});
