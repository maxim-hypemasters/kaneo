import { readFile } from "node:fs/promises";
import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import getTask from "../../apps/api/src/task/controllers/get-task";
import updateTaskType from "../../apps/api/src/task/controllers/update-task-type";
import { setTaskType } from "../../apps/api/src/task/feature-hierarchy/assign-feature";
import updateTaskRelease from "../../apps/api/src/task/controllers/update-task-release";
import { getRelease } from "../../apps/api/src/release/read-releases";
import { readReleaseProgress } from "../../apps/api/src/release/progress/read-release-progress";
import { migrateFeatureHierarchy } from "../../apps/api/src/migrations/feature-hierarchy";
import moveUnfinishedItems from "../../apps/api/src/release/controllers/move-unfinished-items";
import bulkUpdateTasks from "../../apps/api/src/task/controllers/bulk-update-tasks";
import updateTaskStatus from "../../apps/api/src/task/controllers/update-task-status";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const release = await insertRelease(fixture.project.id);
  return { ...member, ...fixture, release };
}

function events(releaseId: string) {
  return db
    .select()
    .from(schema.releaseProgressEventTable)
    .where(eq(schema.releaseProgressEventTable.releaseId, releaseId))
    .orderBy(asc(schema.releaseProgressEventTable.id));
}

describe("Bug progress and schema upgrades", () => {
  it("counts bugs together with tasks in feature summaries and release charts", async () => {
    const ctx = await setup();
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.release.id,
    });
    for (const [type, status] of [
      ["task", "done"],
      ["bug", "done"],
      ["bug", "in-progress"],
      ["bug", "archived"],
      ["bug", "planned"],
    ] as const) {
      await insertTask(ctx.project.id, {
        type,
        status,
        featureId: feature.id,
        releaseId: ctx.release.id,
      });
    }
    expect((await getTask(feature.id, true)).subtaskCounts).toEqual({
      total: 5,
      completed: 2,
    });
    expect((await getRelease(ctx.release.id)).progress).toEqual({
      tasks: { total: 5, completed: 2 },
      features: { total: 1, completed: 0 },
      unfinished: 3,
    });
    expect((await readReleaseProgress(ctx.release.id, "UTC")).current).toEqual({
      scope: 5,
      started: 3,
      completed: 2,
    });
  });

  it("preserves old ledger rows while counting Bug lifecycle and type transitions", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, {
      releaseId: ctx.release.id,
    });
    const before = await events(ctx.release.id);
    const setType = (type: "task" | "bug" | "feature") =>
      updateTaskType({ id: task.id, type, currentUserId: ctx.user.id });
    await setType("bug");
    expect(
      (await readReleaseProgress(ctx.release.id, "UTC")).current.scope,
    ).toBe(1);
    await setType("task");
    expect(
      (await readReleaseProgress(ctx.release.id, "UTC")).current.scope,
    ).toBe(1);
    await setType("bug");
    const beforeRollback = await events(ctx.release.id);
    const rollback = new Error("Rollback Bug promotion");
    await expect(
      db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(schema.taskTable)
          .where(eq(schema.taskTable.id, task.id))
          .for("update");
        await setTaskType(tx, locked!, "feature", ctx.user.id);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await events(ctx.release.id)).toEqual(beforeRollback);
    expect((await getTask(task.id)).type).toBe("bug");
    await setType("feature");
    expect(
      (await readReleaseProgress(ctx.release.id, "UTC")).current.scope,
    ).toBe(0);
    await setType("bug");
    await db
      .update(schema.taskTable)
      .set({ status: "done" })
      .where(eq(schema.taskTable.id, task.id));
    expect((await readReleaseProgress(ctx.release.id, "UTC")).current).toEqual({
      scope: 1,
      started: 1,
      completed: 1,
    });
    await db.delete(schema.taskTable).where(eq(schema.taskTable.id, task.id));
    expect(
      (await readReleaseProgress(ctx.release.id, "UTC")).current.scope,
    ).toBe(0);
    const after = await events(ctx.release.id);
    expect(
      after.filter((row) => before.some((old) => row.id === old.id)),
    ).toEqual(before);
    expect(after.filter((row) => row.status === null)).toEqual(
      before.filter((row) => row.status === null),
    );
  });

  it("moves following bugs with their feature and preserves explicit release overrides", async () => {
    const ctx = await setup();
    const next = await insertRelease(ctx.project.id);
    const override = await insertRelease(ctx.project.id);
    const feature = await insertTask(ctx.project.id, {
      type: "feature",
      releaseId: ctx.release.id,
    });
    const follower = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: feature.id,
      releaseId: ctx.release.id,
    });
    const independent = await insertTask(ctx.project.id, {
      type: "bug",
      featureId: feature.id,
      releaseId: override.id,
    });
    await updateTaskRelease({
      id: feature.id,
      releaseId: next.id,
      currentUserId: ctx.user.id,
    });
    expect((await getTask(follower.id)).releaseId).toBe(next.id);
    expect((await getTask(independent.id)).releaseId).toBe(override.id);
    expect((await readReleaseProgress(next.id, "UTC")).current.scope).toBe(1);
    expect(
      (await readReleaseProgress(ctx.release.id, "UTC")).current.scope,
    ).toBe(0);
    await moveUnfinishedItems(next.id, null, ctx.user.id);
    expect((await getTask(follower.id)).releaseId).toBeNull();
    expect((await getTask(independent.id)).releaseId).toBe(override.id);
  });

  it("keeps bugs in scope through bulk archive, completion and reopening", async () => {
    const ctx = await setup();
    const bug = await insertTask(ctx.project.id, {
      type: "bug",
      releaseId: ctx.release.id,
    });
    await bulkUpdateTasks({
      taskIds: [bug.id],
      operation: "updateStatus",
      value: "archived",
      userId: ctx.user.id,
    });
    expect((await readReleaseProgress(ctx.release.id, "UTC")).current).toEqual({
      scope: 1,
      started: 0,
      completed: 0,
    });
    await bulkUpdateTasks({
      taskIds: [bug.id],
      operation: "updateStatus",
      value: "done",
      userId: ctx.user.id,
    });
    expect((await getRelease(ctx.release.id)).progress.tasks).toEqual({
      total: 1,
      completed: 1,
    });
    await updateTaskStatus({
      id: bug.id,
      status: "in-progress",
      currentUserId: ctx.user.id,
    });
    expect((await readReleaseProgress(ctx.release.id, "UTC")).current).toEqual({
      scope: 1,
      started: 1,
      completed: 0,
    });
  });

  it("upgrades the old constraint and trigger without rewriting existing data or history", async () => {
    const ctx = await setup();
    const task = await insertTask(ctx.project.id, {
      releaseId: ctx.release.id,
    });
    const before = await events(ctx.release.id);
    const oldMigration = await readFile(
      new URL(
        "../../apps/api/drizzle/0066_loose_radioactive_man.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const functionStart = oldMigration.indexOf(
      "CREATE FUNCTION record_task_release_progress()",
    );
    const functionEnd =
      oldMigration.indexOf("$$ LANGUAGE plpgsql;", functionStart) +
      "$$ LANGUAGE plpgsql;".length;
    const oldFunction = oldMigration
      .slice(functionStart, functionEnd)
      .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
    const upgrade = await readFile(
      new URL("../../apps/api/drizzle/0067_mushy_hulk.sql", import.meta.url),
      "utf8",
    );
    const rollback = new Error("Restore upgrade fixture");
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`ALTER TABLE task DROP CONSTRAINT task_feature_shape_check;
        ALTER TABLE task ADD CONSTRAINT task_feature_shape_check CHECK (type IN ('task', 'feature') AND (type = 'task' OR feature_id IS NULL) AND feature_id <> id);`),
        );
        await tx.execute(sql.raw(oldFunction));
        for (const statement of upgrade.split("--> statement-breakpoint")) {
          if (statement.trim()) await tx.execute(sql.raw(statement));
        }
        expect(
          await tx
            .select()
            .from(schema.taskTable)
            .where(eq(schema.taskTable.id, task.id)),
        ).toEqual([task]);
        expect(
          await tx
            .select()
            .from(schema.releaseProgressEventTable)
            .where(
              eq(schema.releaseProgressEventTable.releaseId, ctx.release.id),
            )
            .orderBy(asc(schema.releaseProgressEventTable.id)),
        ).toEqual(before);
        await tx.insert(schema.taskTable).values({
          projectId: ctx.project.id,
          title: "New Bug after upgrade",
          type: "bug",
          number: (task.number ?? 0) + 1,
          releaseId: ctx.release.id,
        });
        const totals = await tx
          .select({ total: sql<number>`sum(delta)`.mapWith(Number) })
          .from(schema.releaseProgressEventTable)
          .where(
            eq(schema.releaseProgressEventTable.releaseId, ctx.release.id),
          );
        expect(totals[0]?.total).toBe(2);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("retains Bug classification when converting legacy subtask links to feature membership", async () => {
    const ctx = await setup();
    const parent = await insertTask(ctx.project.id, { type: "feature" });
    const bug = await insertTask(ctx.project.id, { type: "bug" });
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: parent.id,
      targetTaskId: bug.id,
      relationType: "subtask",
    });
    await migrateFeatureHierarchy();
    expect(await getTask(bug.id)).toMatchObject({
      type: "bug",
      featureId: parent.id,
    });
  });
});
