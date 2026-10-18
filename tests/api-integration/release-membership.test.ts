import { and, asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import duplicateTask from "../../apps/api/src/task/controllers/duplicate-task";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { readErrorBody } from "./helpers/error-body";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

// Runs before each release_changed record while set, so a test can add a
// member between a delete's unlink and its DELETE.
const beforeRecord = vi.hoisted(() => ({
  hook: null as null | (() => Promise<void>),
}));
vi.mock(
  "../../apps/api/src/release/membership/record-release-change",
  async (original) => {
    const actual =
      await original<
        typeof import("../../apps/api/src/release/membership/record-release-change")
      >();
    return {
      recordReleaseChange: async (
        ...args: Parameters<typeof actual.recordReleaseChange>
      ) => {
        await beforeRecord.hook?.();
        return actual.recordReleaseChange(...args);
      },
    };
  },
);

beforeEach(async () => {
  await resetTestDatabase();
  beforeRecord.hook = null;
});

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

async function json(method: string, path: string, body?: unknown) {
  const response = await call(method, path, body);
  expect(response.status, `${method} ${path}`).toBe(200);
  return response.json();
}

const newTask = (values: Record<string, unknown> = {}) => ({
  title: "New task",
  description: "",
  priority: "low",
  status: "to-do",
  ...values,
});

async function releaseOf(id: string) {
  const task = await db.query.taskTable.findFirst({
    where: eq(schema.taskTable.id, id),
  });
  return task?.releaseId;
}

async function releasesOf(ids: string[]) {
  const rows = await db
    .select({ id: schema.taskTable.id, releaseId: schema.taskTable.releaseId })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, ids));
  return Object.fromEntries(rows.map((row) => [row.id, row.releaseId]));
}

async function releaseChanges(taskId: string) {
  const rows = await db
    .select({ eventData: schema.activityTable.eventData })
    .from(schema.activityTable)
    .where(
      and(
        eq(schema.activityTable.taskId, taskId),
        eq(schema.activityTable.type, "release_changed"),
      ),
    )
    .orderBy(asc(schema.activityTable.createdAt));
  return rows.map((row) => row.eventData);
}

const change = (
  projectId: string,
  from: { id: string; name: string } | null,
  to: { id: string; name: string } | null,
) => ({
  projectId,
  oldReleaseId: from?.id ?? null,
  oldReleaseName: from?.name ?? null,
  newReleaseId: to?.id ?? null,
  newReleaseName: to?.name ?? null,
});

async function setup() {
  const member = await createWorkspaceMember({ role: "admin" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const { project: otherProject } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  // Tasks created through the API claim numbers clear of insertTask's.
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: 100_000 })
    .where(inArray(schema.projectTable.id, [project.id, otherProject.id]));
  const r24 = await insertRelease(project.id, { name: "2.4" });
  const r25 = await insertRelease(project.id, { name: "2.5" });
  const r26 = await insertRelease(project.id, { name: "2.6" });
  const elsewhere = await insertRelease(otherProject.id, { name: "Other" });
  mockAuthenticatedSession(member.user);
  return {
    ...member,
    project,
    columns,
    otherProject,
    r24,
    r25,
    r26,
    elsewhere,
  };
}

describe("setting a feature's release (R2)", () => {
  it("moves the feature and the tasks following it, and records each", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const follower = await insertTask(ctx.project.id, {
      featureId: feature.id,
      releaseId: ctx.r24.id,
    });
    const overridden = await insertTask(ctx.project.id, {
      featureId: feature.id,
      releaseId: ctx.r25.id,
    });
    const unplanned = await insertTask(ctx.project.id, {
      featureId: feature.id,
    });
    const outside = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });

    const body = await json("PUT", `/task/release/${feature.id}`, {
      releaseId: ctx.r26.id,
    });

    expect(body).toMatchObject({
      id: feature.id,
      type: "feature",
      releaseId: ctx.r26.id,
      movedTaskIds: [follower.id],
    });
    expect(
      await releasesOf([
        feature.id,
        follower.id,
        overridden.id,
        unplanned.id,
        outside.id,
      ]),
    ).toEqual({
      [feature.id]: ctx.r26.id,
      [follower.id]: ctx.r26.id,
      [overridden.id]: ctx.r25.id,
      [unplanned.id]: null,
      [outside.id]: ctx.r24.id,
    });
    for (const id of [feature.id, follower.id]) {
      expect(await releaseChanges(id)).toEqual([
        change(ctx.project.id, ctx.r24, ctx.r26),
      ]);
    }
    for (const id of [overridden.id, unplanned.id, outside.id]) {
      expect(await releaseChanges(id)).toEqual([]);
    }
  });

  it("treats no release as a release its tasks can follow", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, { type: "feature" });
    const followers = [
      await insertTask(ctx.project.id, { featureId: feature.id }),
      await insertTask(ctx.project.id, { featureId: feature.id }),
    ];
    const planned = await insertTask(ctx.project.id, {
      featureId: feature.id,
      releaseId: ctx.r25.id,
    });

    const into = await json("PUT", `/task/release/${feature.id}`, {
      releaseId: ctx.r24.id,
    });
    expect(into.movedTaskIds).toEqual(followers.map(({ id }) => id).sort());
    expect(await releaseOf(planned.id)).toBe(ctx.r25.id);

    const out = await json("PUT", `/task/release/${feature.id}`, {
      releaseId: null,
    });
    expect(out.movedTaskIds).toEqual(into.movedTaskIds);
    expect(
      await releasesOf([feature.id, ...followers.map(({ id }) => id)]),
    ).toEqual({
      [feature.id]: null,
      [followers[0].id]: null,
      [followers[1].id]: null,
    });
    expect(await releaseChanges(followers[0].id)).toEqual([
      change(ctx.project.id, null, ctx.r24),
      change(ctx.project.id, ctx.r24, null),
    ]);
  });

  it("moves a plain task on its own, and does nothing for its current release", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });

    const same = await json("PUT", `/task/release/${task.id}`, {
      releaseId: ctx.r24.id,
    });
    expect(same).toMatchObject({ releaseId: ctx.r24.id, movedTaskIds: [] });
    expect(await releaseChanges(task.id)).toEqual([]);

    const moved = await json("PUT", `/task/release/${task.id}`, {
      releaseId: ctx.r25.id,
    });
    expect(moved).toMatchObject({ releaseId: ctx.r25.id, movedTaskIds: [] });
    expect(await releaseChanges(task.id)).toEqual([
      change(ctx.project.id, ctx.r24, ctx.r25),
    ]);
  });

  it("reads a release outside the task's project as missing", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });
    const foreign = await createWorkspaceMember();
    const { project: foreignProject } = await createProjectFixture({
      workspaceId: foreign.workspace.id,
    });
    const foreignRelease = await insertRelease(foreignProject.id);

    for (const releaseId of [ctx.elsewhere.id, foreignRelease.id, "nope"]) {
      const response = await call("PUT", `/task/release/${task.id}`, {
        releaseId,
      });
      expect(response.status).toBe(404);
      expect((await readErrorBody(response)).message).toBe("Release not found");
    }
    expect(
      (await call("PUT", `/task/release/${task.id}`, { releaseId: "" })).status,
    ).toBe(400);
    expect(await releaseOf(task.id)).toBe(ctx.r24.id);
    expect(await releaseChanges(task.id)).toEqual([]);
  });
});

describe("creating a task (R3)", () => {
  it("lets an explicit release or null win, and otherwise follows the feature", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const create = (values: Record<string, unknown>) =>
      json("POST", `/task/${ctx.project.id}`, newTask(values));

    const following = await create({ featureId: feature.id });
    const chosen = await create({
      featureId: feature.id,
      releaseId: ctx.r25.id,
    });
    const none = await create({ featureId: feature.id, releaseId: null });
    const loose = await create({});
    const looseChosen = await create({ releaseId: ctx.r26.id });
    const newFeature = await create({ type: "feature", releaseId: ctx.r25.id });

    expect(following.releaseId).toBe(ctx.r24.id);
    expect(chosen.releaseId).toBe(ctx.r25.id);
    expect(none.releaseId).toBeNull();
    expect(loose.releaseId).toBeNull();
    expect(looseChosen.releaseId).toBe(ctx.r26.id);
    expect(newFeature).toMatchObject({
      type: "feature",
      releaseId: ctx.r25.id,
    });
    for (const task of [following, chosen, looseChosen, newFeature]) {
      expect(await releaseOf(task.id)).toBe(task.releaseId);
      // Creation isn't a change of release.
      expect(await releaseChanges(task.id)).toEqual([]);
    }
  });

  it("refuses a release outside the project without creating the task", async () => {
    const ctx = await setup();

    for (const releaseId of [ctx.elsewhere.id, "nope"]) {
      const response = await call(
        "POST",
        `/task/${ctx.project.id}`,
        newTask({ title: "Refused", releaseId }),
      );
      expect(response.status).toBe(404);
      expect((await readErrorBody(response)).message).toBe("Release not found");
    }
    expect(
      (
        await call(
          "POST",
          `/task/${ctx.project.id}`,
          newTask({ releaseId: "" }),
        )
      ).status,
    ).toBe(400);
    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, ctx.project.id));
    expect(tasks).toEqual([]);
  });
});

describe("joining a feature (R4)", () => {
  it("gives a task without a release its feature's, and records it", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const task = await insertTask(ctx.project.id);

    const joined = await json("PUT", `/task/feature/${task.id}`, {
      featureId: feature.id,
    });

    expect(joined).toMatchObject({
      featureId: feature.id,
      releaseId: ctx.r24.id,
    });
    expect(await releaseChanges(task.id)).toEqual([
      change(ctx.project.id, null, ctx.r24),
    ]);
  });

  it("keeps a task's release when it joins, leaves or switches features", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const other = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r26.id,
    });
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r25.id });

    for (const featureId of [feature.id, other.id, null]) {
      const response = await json("PUT", `/task/feature/${task.id}`, {
        featureId,
      });
      expect(response).toMatchObject({ featureId, releaseId: ctx.r25.id });
    }

    // A task that took its feature's release keeps it after leaving.
    const follower = await insertTask(ctx.project.id);
    await json("PUT", `/task/feature/${follower.id}`, {
      featureId: feature.id,
    });
    await json("PUT", `/task/feature/${follower.id}`, { featureId: other.id });
    await json("PUT", `/task/feature/${follower.id}`, { featureId: null });
    expect(await releaseOf(follower.id)).toBe(ctx.r24.id);

    expect(await releaseChanges(task.id)).toEqual([]);
    expect(await releaseChanges(follower.id)).toHaveLength(1);
  });

  it("applies to subtask links from older clients", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const child = await insertTask(ctx.project.id);
    // A plain parent becomes a feature, keeping its release.
    const parent = await insertTask(ctx.project.id, { releaseId: ctx.r25.id });
    const grandchild = await insertTask(ctx.project.id);

    for (const [sourceTaskId, targetTaskId] of [
      [feature.id, child.id],
      [parent.id, grandchild.id],
    ]) {
      const response = await call("POST", "/task-relation", {
        sourceTaskId,
        targetTaskId,
        relationType: "subtask",
      });
      expect(response.status).toBe(200);
    }

    expect(await releasesOf([child.id, parent.id, grandchild.id])).toEqual({
      [child.id]: ctx.r24.id,
      [parent.id]: ctx.r25.id,
      [grandchild.id]: ctx.r25.id,
    });
    expect(await releaseChanges(child.id)).toEqual([
      change(ctx.project.id, null, ctx.r24),
    ]);
  });
});

describe("other task changes", () => {
  it("keeps the release when a task becomes a feature and back (R5)", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });

    for (const type of ["feature", "task"]) {
      expect(
        await json("PUT", `/task/type/${task.id}`, { type }),
      ).toMatchObject({ type, releaseId: ctx.r24.id });
    }
    expect(await releaseChanges(task.id)).toEqual([]);
  });

  it("copies the release when duplicating (R6)", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const task = await insertTask(ctx.project.id, {
      featureId: feature.id,
      releaseId: ctx.r25.id,
    });

    const copy = await json("POST", `/task/duplicate/${task.id}`, {});
    const featureCopy = await json("POST", `/task/duplicate/${feature.id}`, {});

    expect(copy).toMatchObject({
      featureId: feature.id,
      releaseId: ctx.r25.id,
    });
    expect(featureCopy).toMatchObject({
      type: "feature",
      releaseId: ctx.r24.id,
    });
    expect(await releaseChanges(copy.id)).toEqual([]);
  });

  it("duplicates into no release when the source's was deleted meanwhile (R6)", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });
    const findFirst = db.query.taskTable.findFirst.bind(db.query.taskTable);
    const staleRead = vi.spyOn(db.query.taskTable, "findFirst");
    staleRead.mockImplementationOnce((async (
      config: Parameters<typeof findFirst>[0],
    ) => ({
      ...(await findFirst(config)),
      releaseId: "deleted-release",
    })) as never);

    try {
      const copy = await duplicateTask({
        taskId: task.id,
        currentUserId: ctx.user.id,
      });
      expect(staleRead).toHaveBeenCalled();
      expect(copy.releaseId).toBeNull();
    } finally {
      staleRead.mockRestore();
    }
  });

  it("clears the release when moving a task to another project (R7)", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });

    const moved = await json("PUT", `/task/move/${task.id}`, {
      destinationProjectId: ctx.otherProject.id,
    });

    expect(moved.task).toMatchObject({
      projectId: ctx.otherProject.id,
      releaseId: null,
    });
    expect(await releaseChanges(task.id)).toEqual([
      change(ctx.project.id, ctx.r24, null),
    ]);

    // Moving a task without a release records none.
    const loose = await insertTask(ctx.project.id);
    await json("PUT", `/task/move/${loose.id}`, {
      destinationProjectId: ctx.otherProject.id,
    });
    expect(await releaseChanges(loose.id)).toEqual([]);
  });

  it("changes nobody else's release when a task or feature is deleted (R10)", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const tasks = [
      await insertTask(ctx.project.id, {
        featureId: feature.id,
        releaseId: ctx.r24.id,
      }),
      await insertTask(ctx.project.id, { featureId: feature.id }),
    ];
    const sibling = await insertTask(ctx.project.id, {
      featureId: feature.id,
      releaseId: ctx.r24.id,
    });

    await json("DELETE", `/task/${sibling.id}`);
    expect(await releaseOf(feature.id)).toBe(ctx.r24.id);
    await json("DELETE", `/task/${feature.id}`);

    const rows = await db
      .select({
        id: schema.taskTable.id,
        featureId: schema.taskTable.featureId,
        releaseId: schema.taskTable.releaseId,
      })
      .from(schema.taskTable)
      .where(
        inArray(
          schema.taskTable.id,
          tasks.map(({ id }) => id),
        ),
      )
      .orderBy(asc(schema.taskTable.number));
    expect(rows).toEqual([
      { id: tasks[0].id, featureId: null, releaseId: ctx.r24.id },
      { id: tasks[1].id, featureId: null, releaseId: null },
    ]);
    for (const { id } of tasks) expect(await releaseChanges(id)).toEqual([]);
  });

  it("keeps the release through a full task update", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });

    const updated = await json("PUT", `/task/${task.id}`, {
      title: "Renamed",
      description: "",
      priority: "high",
      status: "in-progress",
      projectId: ctx.project.id,
      position: 0,
    });

    expect(updated).toMatchObject({
      title: "Renamed",
      releaseId: ctx.r24.id,
    });
    expect(await releaseOf(task.id)).toBe(ctx.r24.id);
  });

  it("lets the database refuse a link to another project's release", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id);

    const error = await db
      .update(schema.taskTable)
      .set({ releaseId: ctx.elsewhere.id })
      .where(eq(schema.taskTable.id, task.id))
      .then(
        () => null,
        (failure: unknown) => failure,
      );

    expect(error).toMatchObject({
      cause: { code: "23503", constraint: "task_release_fk" },
    });
    expect(await releaseOf(task.id)).toBeNull();
  });
});

describe("deleting a release (R8)", () => {
  it("takes its features and tasks out first, recording each", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.r24.id,
    });
    const task = await insertTask(ctx.project.id, {
      featureId: feature.id,
      releaseId: ctx.r24.id,
    });
    const kept = await insertTask(ctx.project.id, { releaseId: ctx.r25.id });

    expect(await json("DELETE", `/release/${ctx.r24.id}`)).toEqual({
      id: ctx.r24.id,
    });

    expect(await releasesOf([feature.id, task.id, kept.id])).toEqual({
      [feature.id]: null,
      [task.id]: null,
      [kept.id]: ctx.r25.id,
    });
    for (const id of [feature.id, task.id]) {
      expect(await releaseChanges(id)).toEqual([
        change(ctx.project.id, ctx.r24, null),
      ]);
    }
    expect(await releaseChanges(kept.id)).toEqual([]);
    expect(
      await db.query.releaseTable.findFirst({
        where: eq(schema.releaseTable.id, ctx.r24.id),
      }),
    ).toBeUndefined();

    const again = await call("DELETE", `/release/${ctx.r24.id}`);
    expect(again.status).toBe(404);
    expect((await readErrorBody(again)).message).toBe("Release not found");
  });

  it("retries when a task joins between the unlink and the delete", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });
    let latecomer: { id: string } | undefined;
    beforeRecord.hook = async () => {
      if (latecomer) return;
      latecomer = await insertTask(ctx.project.id, {
        releaseId: ctx.r24.id,
      });
    };

    expect(await json("DELETE", `/release/${ctx.r24.id}`)).toEqual({
      id: ctx.r24.id,
    });

    expect(latecomer).toBeDefined();
    const ids = [task.id, latecomer?.id ?? ""];
    expect(await releasesOf(ids)).toEqual({
      [task.id]: null,
      [ids[1]]: null,
    });
    // The first attempt's activity rolled back with it.
    for (const id of ids) {
      expect(await releaseChanges(id)).toEqual([
        change(ctx.project.id, ctx.r24, null),
      ]);
    }
  });

  it("gives up with 409 when tasks keep joining", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, { releaseId: ctx.r24.id });
    let attempts = 0;
    beforeRecord.hook = async () => {
      attempts += 1;
      await insertTask(ctx.project.id, { releaseId: ctx.r24.id });
    };

    const response = await call("DELETE", `/release/${ctx.r24.id}`);

    expect(response.status).toBe(409);
    expect((await readErrorBody(response)).message).toBe(
      "The release is changing; try again",
    );
    expect(attempts).toBe(3);
    expect(await releaseOf(task.id)).toBe(ctx.r24.id);
    expect(await releaseChanges(task.id)).toEqual([]);
    expect(
      await db.query.releaseTable.findFirst({
        where: eq(schema.releaseTable.id, ctx.r24.id),
      }),
    ).toBeDefined();
  });
});

describe("moving unfinished items (R9)", () => {
  async function release24Items() {
    const ctx = await setup();
    const at = (values: Partial<typeof schema.taskTable.$inferInsert>) =>
      insertTask(ctx.project.id, { releaseId: ctx.r24.id, ...values });
    const feature = await at({ type: "feature" });
    const items = {
      feature,
      todo: await at({ featureId: feature.id }),
      done: await at({
        featureId: feature.id,
        status: "done",
        columnId: ctx.columns.done.id,
      }),
      planned: await at({ status: "planned" }),
      archived: await at({ status: "archived" }),
      review: await at({ status: "in-review" }),
    };
    const elsewhere = await insertTask(ctx.project.id, {
      releaseId: ctx.r25.id,
    });
    return { ...ctx, items, elsewhere };
  }

  it("moves each unfinished item to the target, leaving finished and archived ones", async () => {
    const ctx = await release24Items();
    const { feature, todo, done, planned, archived, review } = ctx.items;
    const unfinished = [feature.id, todo.id, planned.id, review.id].sort();

    const body = await json("POST", `/release/${ctx.r24.id}/move-unfinished`, {
      targetReleaseId: ctx.r26.id,
    });

    expect(body).toEqual({ movedTaskIds: unfinished });
    expect(
      await releasesOf([...unfinished, done.id, archived.id, ctx.elsewhere.id]),
    ).toEqual({
      ...Object.fromEntries(unfinished.map((id) => [id, ctx.r26.id])),
      // No feature cascade: the done task stays where it shipped.
      [done.id]: ctx.r24.id,
      [archived.id]: ctx.r24.id,
      [ctx.elsewhere.id]: ctx.r25.id,
    });
    for (const id of unfinished) {
      expect(await releaseChanges(id)).toEqual([
        change(ctx.project.id, ctx.r24, ctx.r26),
      ]);
    }
    expect(await releaseChanges(done.id)).toEqual([]);
  });

  it("takes them out of every release with a null target", async () => {
    const ctx = await release24Items();

    const body = await json("POST", `/release/${ctx.r24.id}/move-unfinished`, {
      targetReleaseId: null,
    });

    expect(body.movedTaskIds).toHaveLength(4);
    for (const id of body.movedTaskIds) {
      expect(await releaseOf(id)).toBeNull();
    }
    expect(await releaseOf(ctx.items.done.id)).toBe(ctx.r24.id);
  });

  it("refuses its own release, another project's and a missing one", async () => {
    const ctx = await release24Items();
    const move = (id: string, targetReleaseId: string | null) =>
      call("POST", `/release/${id}/move-unfinished`, { targetReleaseId });

    const self = await move(ctx.r24.id, ctx.r24.id);
    expect(self.status).toBe(400);
    for (const target of [ctx.elsewhere.id, "nope"]) {
      const response = await move(ctx.r24.id, target);
      expect(response.status).toBe(404);
      expect((await readErrorBody(response)).message).toBe("Release not found");
    }
    expect((await move("nope", null)).status).toBe(404);
    expect((await move(ctx.r24.id, "")).status).toBe(400);

    expect(await releaseOf(ctx.items.todo.id)).toBe(ctx.r24.id);
    expect(await releaseChanges(ctx.items.todo.id)).toEqual([]);
  });

  it("moves nothing from a release without unfinished items", async () => {
    const ctx = await setup();
    await insertTask(ctx.project.id, {
      releaseId: ctx.r24.id,
      status: "done",
      columnId: ctx.columns.done.id,
    });

    expect(
      await json("POST", `/release/${ctx.r24.id}/move-unfinished`, {
        targetReleaseId: ctx.r25.id,
      }),
    ).toEqual({ movedTaskIds: [] });
  });
});
