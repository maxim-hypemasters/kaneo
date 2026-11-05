import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import exportTasks from "../../apps/api/src/task/controllers/export-tasks";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

describe("effort scheduling preservation migration", () => {
  it("copies manual Task/Bug dates and immutable history without guessing estimates or plans", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const start = new Date("2026-10-02T09:00:00Z");
    const due = new Date("2026-10-01T17:00:00Z");
    const task = await insertTask(project.id, {
      startDate: start,
      dueDate: due,
    });
    const bug = await insertTask(project.id, { type: "bug", dueDate: due });
    const archived = await insertTask(project.id, {
      status: "archived",
      startDate: start,
    });
    const undated = await insertTask(project.id);
    const feature = await insertTask(project.id, { type: "feature" });
    const migration = readFileSync(
      new URL(
        "../../apps/api/drizzle/0071_sour_kat_farrell.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const startOfPreservation = migration.indexOf(
      'UPDATE "task" SET "legacy_start_date"',
    );
    expect(startOfPreservation).toBeGreaterThan(0);
    const statements = migration
      .slice(startOfPreservation)
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await db.transaction(async (tx) => {
      for (const statement of statements) await tx.execute(sql.raw(statement));
    });
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task.id),
      }),
    ).toMatchObject({
      startDate: start,
      dueDate: due,
      legacyStartDate: start,
      legacyDueDate: due,
      estimateSeconds: null,
      scheduleSegments: null,
    });
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, bug.id),
      }),
    ).toMatchObject({
      legacyStartDate: null,
      legacyDueDate: due,
      estimateSeconds: null,
    });
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, archived.id),
      }),
    ).toMatchObject({
      status: "archived",
      legacyStartDate: start,
      estimateSeconds: null,
    });
    const snapshots = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.type, "schedule_preserved"));
    expect(snapshots.map((snapshot) => snapshot.taskId).sort()).toEqual(
      [task.id, bug.id, archived.id].sort(),
    );
    expect(
      snapshots.some(
        (snapshot) =>
          snapshot.taskId === feature.id || snapshot.taskId === undated.id,
      ),
    ).toBe(false);
    expect(
      snapshots.find((snapshot) => snapshot.taskId === task.id)?.eventData,
    ).toMatchObject({
      source: "manual",
      startDate: "2026-10-02T09:00:00",
      dueDate: "2026-10-01T17:00:00",
    });
    expect(await db.select().from(schema.projectPlanTable)).toHaveLength(0);
    expect(
      (
        await db.query.projectTable.findFirst({
          where: eq(schema.projectTable.id, project.id),
        })
      )?.scheduleGeneration,
    ).toBe(0);
    const document = await exportTasks(project.id, member.user.id);
    expect(
      document.tasks.find((item) => item.key === task.id)?.scheduleSnapshots,
    ).toEqual([
      expect.objectContaining({
        source: "legacy",
        startDate: start.toISOString(),
        dueDate: due.toISOString(),
      }),
    ]);
  });
});
