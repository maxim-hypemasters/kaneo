import { readFile } from "node:fs/promises";
import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db from "../../apps/api/src/database";
import {
  columnTable,
  projectTable,
  projectWorkflowHistoryTable,
  releaseProgressEventTable,
  releaseTable,
  taskTable,
  workspaceTable,
} from "../../apps/api/src/database/schema";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

async function setup() {
  const { workspace } = await createWorkspaceMember();
  const fixture = await createProjectFixture({ workspaceId: workspace.id });
  const release = await insertRelease(fixture.project.id);
  return { workspace, ...fixture, release };
}

function events(releaseId: string) {
  return db
    .select()
    .from(releaseProgressEventTable)
    .where(eq(releaseProgressEventTable.releaseId, releaseId))
    .orderBy(asc(releaseProgressEventTable.id));
}

async function buckets(releaseId: string) {
  const totals: Record<string, number> = {};
  for (const event of await events(releaseId)) {
    if (event.status === null) continue;
    totals[event.status] = (totals[event.status] ?? 0) + event.delta;
  }
  return totals;
}

function workflow(projectId: string) {
  return db
    .select()
    .from(projectWorkflowHistoryTable)
    .where(eq(projectWorkflowHistoryTable.projectId, projectId))
    .orderBy(asc(projectWorkflowHistoryTable.id));
}

describe("release progress database history", () => {
  it("starts every release with exactly one zero baseline", async () => {
    const { release } = await setup();
    expect(await events(release.id)).toEqual([
      expect.objectContaining({
        releaseId: release.id,
        status: null,
        delta: 0,
      }),
    ]);
    await expect(
      db.insert(releaseProgressEventTable).values({
        releaseId: release.id,
        status: null,
        delta: 0,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(releaseProgressEventTable).values({
        releaseId: release.id,
        status: null,
        delta: 1,
      }),
    ).rejects.toThrow();
  });

  it("tracks membership, status, type and deletion without task foreign keys", async () => {
    const { project, release } = await setup();
    const next = await insertRelease(project.id);
    const task = await insertTask(project.id, { releaseId: release.id });
    const initial = await events(release.id);
    await db
      .update(taskTable)
      .set({ title: "Cosmetic edit" })
      .where(eq(taskTable.id, task.id));
    expect(await events(release.id)).toEqual(initial);

    await db
      .update(taskTable)
      .set({ status: "done" })
      .where(eq(taskTable.id, task.id));
    await expect(
      db
        .update(taskTable)
        .set({ type: "feature" })
        .where(eq(taskTable.id, task.id)),
    ).rejects.toThrow();
    await db
      .update(taskTable)
      .set({ type: "bug" })
      .where(eq(taskTable.id, task.id));
    expect(await buckets(release.id)).toEqual({ "to-do": 0, done: 1 });
    await db
      .update(taskTable)
      .set({ type: "task" })
      .where(eq(taskTable.id, task.id));
    await db
      .update(taskTable)
      .set({ releaseId: next.id })
      .where(eq(taskTable.id, task.id));
    expect(await buckets(release.id)).toEqual({ "to-do": 0, done: 0 });
    expect(await buckets(next.id)).toEqual({ done: 1 });

    await db.delete(taskTable).where(eq(taskTable.id, task.id));
    expect(await buckets(next.id)).toEqual({ done: 0 });
    expect(await events(next.id)).toHaveLength(3);
  });

  it("excludes feature contributions and records project moves in both releases", async () => {
    const { project, release, workspace } = await setup();
    await insertTask(project.id, { type: "feature", releaseId: release.id });
    expect(await events(release.id)).toHaveLength(1);
    const task = await insertTask(project.id, { releaseId: release.id });
    const other = await createProjectFixture({ workspaceId: workspace.id });
    const target = await insertRelease(other.project.id);
    await db
      .update(taskTable)
      .set({
        projectId: other.project.id,
        releaseId: target.id,
        status: "in-progress",
        columnId: other.columns.inProgress.id,
      })
      .where(eq(taskTable.id, task.id));
    expect(await buckets(release.id)).toEqual({ "to-do": 0 });
    expect(await buckets(target.id)).toEqual({ "in-progress": 1 });
  });

  it("keeps workflow definitions for final flags, reordering and deleted columns", async () => {
    const { project, columns } = await setup();
    const initial = await workflow(project.id);
    expect(initial).toHaveLength(4);
    await db
      .update(columnTable)
      .set({ name: "Working", color: "#ffffff" })
      .where(eq(columnTable.id, columns.inProgress.id));
    expect(await workflow(project.id)).toEqual(initial);
    await db
      .update(columnTable)
      .set({ isFinal: true })
      .where(eq(columnTable.id, columns.inProgress.id));
    await db
      .update(columnTable)
      .set({ position: 7 })
      .where(eq(columnTable.id, columns.inProgress.id));
    await db
      .delete(columnTable)
      .where(eq(columnTable.id, columns.inProgress.id));
    const history = (await workflow(project.id)).filter(
      (row) => row.columnId === columns.inProgress.id,
    );
    expect(
      history.map(({ position, isFinal, present }) => ({
        position,
        isFinal,
        present,
      })),
    ).toEqual([
      { position: 1, isFinal: false, present: true },
      { position: 1, isFinal: true, present: true },
      { position: 7, isFinal: true, present: true },
      { position: 7, isFinal: true, present: false },
    ]);
  });

  it("rolls back task, release and workflow history with their writes", async () => {
    const { project, release, columns } = await setup();
    const task = await insertTask(project.id, { releaseId: release.id });
    const beforeEvents = await events(release.id);
    const beforeWorkflow = await workflow(project.id);
    const rollback = new Error("Rollback history fixture");
    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(taskTable)
          .set({ status: "done" })
          .where(eq(taskTable.id, task.id));
        await tx
          .update(columnTable)
          .set({ isFinal: true })
          .where(eq(columnTable.id, columns.todo.id));
        await tx.insert(releaseTable).values({
          projectId: project.id,
          name: "Rolled back",
          startDate: "2026-10-01",
          codeFreezeDate: "2026-10-15",
          submissionDate: "2026-10-20",
        });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await events(release.id)).toEqual(beforeEvents);
    expect(await workflow(project.id)).toEqual(beforeWorkflow);
    expect(await db.select().from(releaseTable)).toHaveLength(1);
  });

  it("captures multirow and concurrent mutations in the same release", async () => {
    const { project, release } = await setup();
    const tasks = await Promise.all(
      Array.from({ length: 8 }, () =>
        insertTask(project.id, { releaseId: release.id }),
      ),
    );
    await Promise.all(
      tasks.map((task) =>
        db.transaction(async (tx) => {
          await tx
            .update(taskTable)
            .set({ status: "done" })
            .where(eq(taskTable.id, task.id));
        }),
      ),
    );
    expect(await buckets(release.id)).toEqual({ "to-do": 0, done: 8 });
    await db
      .update(taskTable)
      .set({ status: "archived" })
      .where(eq(taskTable.releaseId, release.id));
    expect(await buckets(release.id)).toEqual({
      "to-do": 0,
      done: 0,
      archived: 8,
    });
  });

  it.each(["project", "workspace"])(
    "cleans history during %s cascades without creating orphan events",
    async (parent) => {
      const { project, release, workspace } = await setup();
      await insertTask(project.id, { releaseId: release.id });
      if (parent === "project") {
        await db.delete(projectTable).where(eq(projectTable.id, project.id));
      } else {
        await db
          .delete(workspaceTable)
          .where(eq(workspaceTable.id, workspace.id));
      }
      expect(await events(release.id)).toEqual([]);
      expect(await workflow(project.id)).toEqual([]);
    },
  );

  it("deletes release history when its unlinked release is deleted", async () => {
    const { project, release } = await setup();
    const task = await insertTask(project.id, { releaseId: release.id });
    await db
      .update(taskTable)
      .set({ releaseId: null })
      .where(eq(taskTable.id, task.id));
    await db.delete(releaseTable).where(eq(releaseTable.id, release.id));
    expect(await events(release.id)).toEqual([]);
    expect(await workflow(project.id)).toHaveLength(4);
  });

  it("seeds existing installations at one truthful baseline timestamp", async () => {
    const { project, release } = await setup();
    await insertTask(project.id, {
      releaseId: release.id,
      createdAt: new Date("2020-01-01"),
      status: "done",
    });
    await insertTask(project.id, { releaseId: release.id, type: "feature" });
    const migration = await readFile(
      new URL(
        "../../apps/api/drizzle/0066_loose_radioactive_man.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const rollback = new Error("Restore migration fixture");
    const before = Date.now();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`
        DROP FUNCTION record_task_release_progress() CASCADE;
        DROP FUNCTION record_project_workflow_history() CASCADE;
        DROP FUNCTION record_release_progress_baseline() CASCADE;
        DROP TABLE release_progress_event, project_workflow_history;
      `),
        );
        for (const statement of migration.split("--> statement-breakpoint")) {
          if (statement.trim()) await tx.execute(sql.raw(statement));
        }
        const seeded = await tx.select().from(releaseProgressEventTable);
        expect(seeded.map(({ status, delta }) => ({ status, delta }))).toEqual([
          { status: null, delta: 0 },
          { status: "done", delta: 1 },
        ]);
        const definitions = await tx.select().from(projectWorkflowHistoryTable);
        expect(definitions).toHaveLength(4);
        expect(seeded[0].recordedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(
          new Set(
            [...seeded, ...definitions].map((row) => row.recordedAt.getTime()),
          ).size,
        ).toBe(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
