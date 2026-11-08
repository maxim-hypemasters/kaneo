import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { insertTask } from "./helpers/release/insert-task";

beforeEach(resetTestDatabase);

const migration = readFileSync(
  new URL(
    "../../apps/api/drizzle/0075_features_without_relations.sql",
    import.meta.url,
  ),
  "utf8",
);

class Rollback extends Error {}

describe("features without relations migration", () => {
  it("deletes only Feature-ended relations, keeps membership, and refuses new ones", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const feature = await insertTask(project.id, { type: "feature" });
    const task = await insertTask(project.id, { featureId: feature.id });
    const bug = await insertTask(project.id, { type: "bug" });
    const other = await insertTask(project.id);
    const removal = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .find((statement) => statement.startsWith('DELETE FROM "task_relation"'));
    expect(removal).toBeDefined();

    await db
      .transaction(async (tx) => {
        // Rows written before the trigger existed.
        await tx.execute(
          sql`ALTER TABLE "task_relation" DISABLE TRIGGER task_relation_without_features`,
        );
        const legacy = await tx
          .insert(schema.taskRelationTable)
          .values([
            {
              sourceTaskId: feature.id,
              targetTaskId: task.id,
              relationType: "blocks",
            },
            {
              sourceTaskId: bug.id,
              targetTaskId: feature.id,
              relationType: "related",
            },
          ])
          .returning();
        const kept = await tx
          .insert(schema.taskRelationTable)
          .values([
            {
              sourceTaskId: task.id,
              targetTaskId: bug.id,
              relationType: "blocks",
            },
            {
              sourceTaskId: other.id,
              targetTaskId: task.id,
              relationType: "related",
            },
          ])
          .returning();
        await tx.execute(
          sql`ALTER TABLE "task_relation" ENABLE TRIGGER task_relation_without_features`,
        );

        await tx.execute(sql.raw(removal!));

        const remaining = await tx.select().from(schema.taskRelationTable);
        expect(remaining.map((row) => row.id).sort()).toEqual(
          kept.map((row) => row.id).sort(),
        );
        expect(
          remaining.some((row) => legacy.some((gone) => gone.id === row.id)),
        ).toBe(false);
        const [membership] = await tx
          .select({ featureId: schema.taskTable.featureId })
          .from(schema.taskTable)
          .where(eq(schema.taskTable.id, task.id));
        expect(membership).toEqual({ featureId: feature.id });

        // A savepoint per attempt keeps the transaction usable after each refusal.
        await expect(
          tx.transaction((attempt) =>
            attempt.insert(schema.taskRelationTable).values({
              sourceTaskId: other.id,
              targetTaskId: feature.id,
              relationType: "blocks",
            }),
          ),
        ).rejects.toMatchObject({ cause: { code: "23514" } });
        await expect(
          tx.transaction((attempt) =>
            attempt
              .update(schema.taskRelationTable)
              .set({ sourceTaskId: feature.id })
              .where(
                inArray(
                  schema.taskRelationTable.id,
                  kept.map((row) => row.id),
                ),
              ),
          ),
        ).rejects.toMatchObject({ cause: { code: "23514" } });
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });

    expect(await db.select().from(schema.taskRelationTable)).toEqual([]);
  });
});
