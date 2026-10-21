import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);
const dateRangeSql = readFileSync(
  new URL("../../apps/api/drizzle/0069_woozy_whiplash.sql", import.meta.url),
  "utf8",
);

it("upgrades existing target dates into end dates while preserving metadata, links and release history", async () => {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({ workspaceId: workspace.id });
  const release = await insertRelease(project.id);
  const feature = await insertTask(project.id, {
    type: "feature",
    releaseId: release.id,
  });
  const bug = await insertTask(project.id, {
    type: "bug",
    featureId: feature.id,
    releaseId: release.id,
    status: "done",
    userId: user.id,
  });
  const history = await db
    .select()
    .from(schema.releaseProgressEventTable)
    .orderBy(schema.releaseProgressEventTable.id);
  const workflow = await db
    .select()
    .from(schema.projectWorkflowHistoryTable)
    .orderBy(schema.projectWorkflowHistoryTable.id);
  const rollback = new Error("restore date range schema");
  await expect(
    db.transaction(async (tx) => {
      // Recreate 0068's applied shape without changing its original migration.
      await tx.execute(
        sql`alter table milestone drop constraint milestone_date_order_check`,
      );
      await tx.execute(sql`alter table milestone drop column start_date`);
      await tx.execute(
        sql`alter table milestone rename column end_date to target_date`,
      );
      await tx.execute(sql`insert into milestone (id, feature_id, title, description, target_date, position) values
      ('legacy-dated', ${feature.id}, 'Dated', 'Keep this description', '2026-11-03', 4),
      ('legacy-empty', ${feature.id}, 'Undated', null, null, 8)`);
      await tx
        .update(schema.taskTable)
        .set({ milestoneId: "legacy-dated" })
        .where(eq(schema.taskTable.id, bug.id));
      const before = await tx.execute(
        sql`select id, feature_id as "featureId", title, description, target_date::text as "endDate", position, created_at as "createdAt", updated_at as "updatedAt" from milestone order by id`,
      );
      await tx.execute(sql.raw(dateRangeSql));
      const milestones = await tx
        .select()
        .from(schema.milestoneTable)
        .orderBy(schema.milestoneTable.id);
      const after = await tx.execute(
        sql`select id, feature_id as "featureId", title, description, start_date::text as "startDate", end_date::text as "endDate", position, created_at as "createdAt", updated_at as "updatedAt" from milestone order by id`,
      );
      expect(after.rows).toEqual(
        before.rows.map((row) => ({ ...row, startDate: null })),
      );
      expect(milestones[0]).toMatchObject({
        id: "legacy-dated",
        legacyStartDate: null,
        legacyEndDate: "2026-11-03",
        position: 4,
      });
      expect(milestones[1]).toMatchObject({
        id: "legacy-empty",
        legacyStartDate: null,
        legacyEndDate: null,
        position: 8,
      });
      const [linked] = await tx
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, bug.id));
      expect(linked).toMatchObject({
        milestoneId: "legacy-dated",
        featureId: feature.id,
        releaseId: release.id,
        type: "bug",
      });
      expect(
        await tx
          .select()
          .from(schema.releaseProgressEventTable)
          .orderBy(schema.releaseProgressEventTable.id),
      ).toEqual(history);
      expect(
        await tx
          .select()
          .from(schema.projectWorkflowHistoryTable)
          .orderBy(schema.projectWorkflowHistoryTable.id),
      ).toEqual(workflow);
      await expect(
        tx.transaction(async (nested) => {
          await nested.insert(schema.milestoneTable).values({
            featureId: feature.id,
            title: "Inverted",
            legacyStartDate: "2026-11-04",
            legacyEndDate: "2026-11-03",
          });
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(await db.select().from(schema.milestoneTable)).toEqual([]);
});
