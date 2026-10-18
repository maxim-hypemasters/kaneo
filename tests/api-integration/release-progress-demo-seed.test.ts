import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { seedReleaseProgress } from "../../apps/api/scripts/seed-release-progress";
import {
  buildDemoPlan,
  shiftDay,
} from "../../apps/api/scripts/release-progress-demo-plan";
import db, { getDatabasePool } from "../../apps/api/src/database";
import {
  projectTable,
  projectWorkflowHistoryTable,
  releaseProgressEventTable,
  releaseTable,
  taskTable,
} from "../../apps/api/src/database/schema";
import { readReleaseProgress } from "../../apps/api/src/release/progress/read-release-progress";
import { getRelease } from "../../apps/api/src/release/read-releases";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

const today = new Date().toISOString().slice(0, 10);
beforeEach(resetTestDatabase);

async function setup() {
  const { workspace } = await createWorkspaceMember();
  const fixture = await createProjectFixture({ workspaceId: workspace.id });
  const release = await insertRelease(fixture.project.id, { name: "0.69" });
  const feature = await insertTask(fixture.project.id, {
    releaseId: release.id,
    type: "feature",
  });
  for (let index = 0; index < 6; index += 1) {
    await insertTask(fixture.project.id, {
      releaseId: release.id,
      featureId: feature.id,
    });
  }
  await db
    .update(projectTable)
    .set({ lastTaskNumber: 120 })
    .where(eq(projectTable.id, fixture.project.id));
  return { workspace, ...fixture, release };
}

async function seed(projectId: string, apply = true) {
  const client = await getDatabasePool().connect();
  try {
    return await seedReleaseProgress(client, { projectId, today, apply });
  } finally {
    client.release();
  }
}

async function snapshot(projectId: string) {
  return {
    tasks: await db
      .select()
      .from(taskTable)
      .where(eq(taskTable.projectId, projectId))
      .orderBy(asc(taskTable.id)),
    releases: await db
      .select()
      .from(releaseTable)
      .where(eq(releaseTable.projectId, projectId))
      .orderBy(asc(releaseTable.id)),
    workflow: await db
      .select()
      .from(projectWorkflowHistoryTable)
      .where(eq(projectWorkflowHistoryTable.projectId, projectId))
      .orderBy(asc(projectWorkflowHistoryTable.id)),
    counter: await db
      .select({ value: projectTable.lastTaskNumber })
      .from(projectTable)
      .where(eq(projectTable.id, projectId)),
    events: await db
      .select()
      .from(releaseProgressEventTable)
      .orderBy(asc(releaseProgressEventTable.id)),
  };
}

describe("release progress demo seed", () => {
  it("dry-runs without changing tasks, releases, workflow, history or numbering", async () => {
    const { project } = await setup();
    const before = await snapshot(project.id);
    expect(await seed(project.id, false)).toMatchObject({
      mode: "dry-run",
      project: { name: project.name },
      create: { releases: 3, features: 6, tasks: 30 },
    });
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("adds samples with agreeing histories while preserving all existing work", async () => {
    const { project, release } = await setup();
    const before = await snapshot(project.id);
    const beforeProgress = await readReleaseProgress(release.id, "UTC");
    expect(await seed(project.id)).toMatchObject({
      create: { releases: 3, features: 6, tasks: 30 },
    });
    const after = await snapshot(project.id);
    expect(
      after.tasks.filter((row) =>
        before.tasks.some((old) => old.id === row.id),
      ),
    ).toEqual(before.tasks);
    expect(after.releases.find((row) => row.id === release.id)).toEqual(
      before.releases[0],
    );
    expect(
      after.workflow.filter((row) =>
        before.workflow.some((old) => old.id === row.id),
      ),
    ).toEqual(before.workflow);
    expect(after.events.filter((row) => row.releaseId === release.id)).toEqual(
      before.events,
    );
    expect(await readReleaseProgress(release.id, "UTC")).toEqual(
      beforeProgress,
    );
    expect(after.tasks).toHaveLength(43);
    expect(after.counter).toEqual([{ value: 156 }]);
    const sampleTasks = after.tasks.filter((row) =>
      row.id.startsWith("demo-release-progress:"),
    );
    expect(Math.min(...sampleTasks.map((row) => row.number ?? 0))).toBe(121);
    for (const sample of buildDemoPlan(project.id, today)) {
      const progress = await readReleaseProgress(sample.id, "UTC");
      const summary = await getRelease(sample.id);
      expect(progress.current.scope).toBe(10);
      expect(progress.current.scope).toBe(summary.progress.tasks.total);
      expect(progress.current.completed).toBe(summary.progress.tasks.completed);
      expect(summary.progress.features.total).toBe(2);
      if (sample.phase === "upcoming") expect(progress.points).toEqual([]);
      else expect(progress.points.length).toBeGreaterThan(1);
    }
  });

  it("skips existing samples on rerun and preserves later edits and deleted tasks", async () => {
    const { project } = await setup();
    await seed(project.id);
    const sample = buildDemoPlan(project.id, today)[1]!;
    const tasks = sample.items.filter((item) => item.type === "task");
    await db
      .update(taskTable)
      .set({ title: "User edited sample", status: "done" })
      .where(eq(taskTable.id, tasks[5]!.id));
    await db.delete(taskTable).where(eq(taskTable.id, tasks[6]!.id));
    await db
      .update(releaseTable)
      .set({ name: "User renamed sample" })
      .where(eq(releaseTable.id, sample.id));
    const before = await snapshot(project.id);
    expect(await seed(project.id)).toMatchObject({
      create: { releases: 0, features: 0, tasks: 0 },
      skippedReleases: 3,
    });
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("refuses to invent shared workflow history over earlier real tracking", async () => {
    const { project } = await setup();
    await db
      .update(releaseProgressEventTable)
      .set({ recordedAt: new Date(`${shiftDay(today, -1)}T12:00:00Z`) });
    const before = await snapshot(project.id);
    await expect(seed(project.id)).rejects.toThrow(
      "Earlier real release history",
    );
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("rolls back all changes when a demo name belongs to an unrelated release", async () => {
    const { project } = await setup();
    await insertRelease(project.id, { name: "Demo · 0.70" });
    const before = await snapshot(project.id);
    await expect(seed(project.id)).rejects.toThrow("already used");
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("keeps every simulated status bucket equal to current task rows", async () => {
    const { project } = await setup();
    await seed(project.id);
    const result = await db.execute<{ mismatch: number }>(sql`
      WITH expected AS (
        SELECT release_id, status, count(*)::integer AS total FROM task
        WHERE type = 'task' AND release_id IS NOT NULL GROUP BY release_id, status
      ), actual AS (
        SELECT release_id, status, sum(delta)::integer AS total FROM release_progress_event
        WHERE status IS NOT NULL GROUP BY release_id, status
      ) SELECT count(*)::integer AS mismatch FROM expected FULL JOIN actual USING (release_id, status)
      WHERE coalesce(expected.total, 0) <> coalesce(actual.total, 0)
    `);
    expect(result.rows).toEqual([{ mismatch: 0 }]);
  });
});
