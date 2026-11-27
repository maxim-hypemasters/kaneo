import { eq, inArray, sql } from "drizzle-orm";
import db from "../../database";
import { dataMigrationTable, integrationTable } from "../../database/schema";
import { switchBranchPattern } from "./switch-branch-pattern";

const COMPLETION_ID = "branch-pattern-default-v1";
const GIT_INTEGRATION_TYPES = ["github", "gitlab", "gitea"];

// Runs once: integration setup stored the old default pattern, so without
// this existing projects would keep naming branches the old way.
export async function migrateBranchPatternDefault() {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${COMPLETION_ID}))`,
    );
    const [done] = await tx
      .select({ id: dataMigrationTable.id })
      .from(dataMigrationTable)
      .where(eq(dataMigrationTable.id, COMPLETION_ID));
    if (done) return;

    let integrations = 0;
    const rows = await tx
      .select({ id: integrationTable.id, config: integrationTable.config })
      .from(integrationTable)
      .where(inArray(integrationTable.type, GIT_INTEGRATION_TYPES));
    for (const row of rows) {
      const config = switchBranchPattern(row.config);
      if (!config) continue;
      await tx
        .update(integrationTable)
        .set({ config })
        .where(eq(integrationTable.id, row.id));
      integrations += 1;
    }

    await tx.insert(dataMigrationTable).values({ id: COMPLETION_ID });
    if (integrations > 0) {
      console.log(
        `✅ Switched ${integrations} integration(s) to the feature/bugfix branch pattern.`,
      );
    }
  });
}
