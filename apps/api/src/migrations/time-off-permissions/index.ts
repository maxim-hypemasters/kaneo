import { eq, sql } from "drizzle-orm";
import db from "../../database";
import { dataMigrationTable, workspaceRoleTable } from "../../database/schema";
import { grantTimeOffPermissions } from "./grant-time-off-permissions";

const COMPLETION_ID = "time-off-permissions-v1";

// Runs once: stored roles replace the compiled defaults wholesale, so without
// this nobody on an existing install could see or request time off. Scoped
// API keys are explicit allow-lists and stay unchanged.
export async function migrateTimeOffPermissions() {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${COMPLETION_ID}))`,
    );
    const [done] = await tx
      .select({ id: dataMigrationTable.id })
      .from(dataMigrationTable)
      .where(eq(dataMigrationTable.id, COMPLETION_ID));
    if (done) return;

    let roles = 0;
    const roleRows = await tx
      .select({
        id: workspaceRoleTable.id,
        permission: workspaceRoleTable.permission,
      })
      .from(workspaceRoleTable);
    for (const row of roleRows) {
      const permission = grantTimeOffPermissions(row.permission);
      if (!permission) continue;
      await tx
        .update(workspaceRoleTable)
        .set({ permission })
        .where(eq(workspaceRoleTable.id, row.id));
      roles += 1;
    }

    await tx.insert(dataMigrationTable).values({ id: COMPLETION_ID });
    if (roles > 0) {
      console.log(`✅ Granted time-off permissions to ${roles} role(s).`);
    }
  });
}
