import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import createTaskRelation from "../../apps/api/src/task-relation/controllers/create-task-relation";
import moveTask from "../../apps/api/src/task/controllers/move-task";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const publish = vi.hoisted(() =>
  vi.fn(async (_event: string, _data?: unknown) => undefined),
);
vi.mock("../../apps/api/src/events", async (original) => ({
  ...(await original<object>()),
  publishEvent: publish,
}));
beforeEach(async () => {
  await resetTestDatabase();
  publish.mockClear();
  vi.restoreAllMocks();
});

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

async function setup() {
  const member = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const { project: otherProject } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const feature = await addTask(project.id, { type: "feature" });
  return { ...member, project, otherProject, feature };
}

describe("feature hierarchy events", () => {
  it("announces the feature a moved task left, as read under the move's lock", async () => {
    const ctx = await setup();
    const task = await addTask(ctx.project.id, { featureId: ctx.feature.id });
    // The task joined its feature after the move first read it.
    const findFirst = db.query.taskTable.findFirst.bind(db.query.taskTable);
    const staleRead = vi.spyOn(db.query.taskTable, "findFirst");
    staleRead.mockImplementationOnce((async (
      config: Parameters<typeof findFirst>[0],
    ) => ({
      ...(await findFirst(config)),
      featureId: null,
    })) as never);

    await moveTask({
      taskId: task.id,
      destinationProjectId: ctx.otherProject.id,
      currentUserId: ctx.user.id,
    });

    expect(staleRead).toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith("task.updated", {
      taskId: ctx.feature.id,
      projectId: ctx.project.id,
      userId: ctx.user.id,
    });
    const [left] = await db
      .select({ eventData: schema.activityTable.eventData })
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, task.id),
          eq(schema.activityTable.type, "feature_changed"),
        ),
      );
    expect(left?.eventData).toMatchObject({
      projectId: ctx.project.id,
      oldFeatureId: ctx.feature.id,
      newFeatureId: null,
    });
  });

  it("announces the related link an older client's subtask link adds", async () => {
    const ctx = await setup();
    const parent = await addTask(ctx.project.id, { featureId: ctx.feature.id });
    const child = await addTask(ctx.project.id);

    await createTaskRelation({
      sourceTaskId: parent.id,
      targetTaskId: child.id,
      relationType: "subtask",
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
    });

    const created = publish.mock.calls.filter(
      ([event]) => event === "task-relation.created",
    );
    expect(created).toEqual([
      [
        "task-relation.created",
        expect.objectContaining({
          sourceTaskId: parent.id,
          targetTaskId: child.id,
          relationType: "related",
          taskId: parent.id,
          projectId: ctx.project.id,
          userId: ctx.user.id,
        }),
      ],
    ]);
  });

  it("announces no related link when one already joins the two", async () => {
    const ctx = await setup();
    const parent = await addTask(ctx.project.id, { featureId: ctx.feature.id });
    const child = await addTask(ctx.project.id);
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: child.id,
      targetTaskId: parent.id,
      relationType: "related",
    });

    await createTaskRelation({
      sourceTaskId: parent.id,
      targetTaskId: child.id,
      relationType: "subtask",
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
    });

    expect(
      publish.mock.calls.some(([event]) => event === "task-relation.created"),
    ).toBe(false);
  });
});
