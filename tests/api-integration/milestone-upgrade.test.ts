import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { lockMilestone } from "../../apps/api/src/milestone/membership";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertRelease } from "./helpers/release/insert-release";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);
const upgradeSql = readFileSync(
  new URL("../../apps/api/drizzle/0068_dashing_slyde.sql", import.meta.url),
  "utf8",
);

const dateRangeUpgradeSql = readFileSync(
  new URL("../../apps/api/drizzle/0069_woozy_whiplash.sql", import.meta.url),
  "utf8",
);

describe("milestone migration upgrade", () => {
  it("upgrades existing Feature/Task/Bug data without changing release baselines or history", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const release = await insertRelease(project.id);
    const feature = await insertTask(project.id, {
      type: "feature",
      releaseId: release.id,
    });
    const task = await insertTask(project.id, {
      featureId: feature.id,
      releaseId: release.id,
    });
    const bug = await insertTask(project.id, {
      type: "bug",
      featureId: feature.id,
      releaseId: release.id,
      status: "done",
    });
    const before = await db
      .select()
      .from(schema.taskTable)
      .orderBy(schema.taskTable.id);
    const history = await db
      .select()
      .from(schema.releaseProgressEventTable)
      .orderBy(schema.releaseProgressEventTable.id);
    expect(history.filter((event) => event.status === null)).toHaveLength(1);
    const workflow = await db
      .select()
      .from(schema.projectWorkflowHistoryTable)
      .orderBy(schema.projectWorkflowHistoryTable.id);
    const releaseBefore = await db.query.releaseTable.findFirst({
      where: eq(schema.releaseTable.id, release.id),
    });
    const rollback = new Error("restore schema after upgrade check");
    await expect(
      db.transaction(async (tx) => {
        // DDL is transactional: recreate the pre-0068 shape, then run the actual
        // generated migration. The intentional rollback restores test isolation.
        await tx.execute(sql`alter table task drop column milestone_id`);
        await tx.execute(sql`drop table milestone`);
        await tx.execute(sql.raw(upgradeSql));
        await tx.execute(sql.raw(dateRangeUpgradeSql));
        const upgraded = await tx
          .select()
          .from(schema.taskTable)
          .orderBy(schema.taskTable.id);
        expect(upgraded).toEqual(before);
        expect(upgraded.map((item) => item.milestoneId)).toEqual([
          null,
          null,
          null,
        ]);
        expect(upgraded.find((item) => item.id === task.id)).toMatchObject({
          type: "task",
          featureId: feature.id,
          releaseId: release.id,
        });
        expect(upgraded.find((item) => item.id === bug.id)).toMatchObject({
          type: "bug",
          featureId: feature.id,
          releaseId: release.id,
        });
        expect(await tx.select().from(schema.milestoneTable)).toEqual([]);
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
        const [releaseAfter] = await tx
          .select()
          .from(schema.releaseTable)
          .where(eq(schema.releaseTable.id, release.id));
        expect(releaseAfter).toEqual(releaseBefore);
        const [created] = await tx
          .insert(schema.milestoneTable)
          .values({ featureId: feature.id, title: "First tracked milestone" })
          .returning();
        await lockMilestone(tx, created!.id, feature.id, project.id);
        await tx
          .update(schema.taskTable)
          .set({ milestoneId: created!.id })
          .where(eq(schema.taskTable.id, bug.id));
        expect(
          (
            await tx
              .select()
              .from(schema.taskTable)
              .where(eq(schema.taskTable.id, bug.id))
          )[0]?.milestoneId,
        ).toBe(created!.id);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      await db.select().from(schema.taskTable).orderBy(schema.taskTable.id),
    ).toEqual(before);
    expect(await db.select().from(schema.milestoneTable)).toEqual([]);
  });

  it("cascades project deletion through Features, milestones and linked Task/Bug work", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const release = await insertRelease(project.id);
    const feature = await insertTask(project.id, {
      type: "feature",
      releaseId: release.id,
    });
    const [milestone] = await db
      .insert(schema.milestoneTable)
      .values({ featureId: feature.id, title: "Owned milestone" })
      .returning();
    await insertTask(project.id, {
      type: "task",
      featureId: feature.id,
      milestoneId: milestone!.id,
      releaseId: release.id,
    });
    await insertTask(project.id, {
      type: "bug",
      featureId: feature.id,
      milestoneId: milestone!.id,
      releaseId: release.id,
    });
    await db
      .delete(schema.projectTable)
      .where(eq(schema.projectTable.id, project.id));
    expect(await db.select().from(schema.milestoneTable)).toEqual([]);
    expect(await db.select().from(schema.taskTable)).toEqual([]);
    expect(await db.select().from(schema.releaseTable)).toEqual([]);
    expect(await db.select().from(schema.releaseProgressEventTable)).toEqual(
      [],
    );
    expect(await db.select().from(schema.projectWorkflowHistoryTable)).toEqual(
      [],
    );
  });
});
