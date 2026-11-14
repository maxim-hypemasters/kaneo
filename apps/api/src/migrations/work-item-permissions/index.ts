import { eq, isNotNull, sql } from "drizzle-orm";
import db from "../../database";
import {
  apikeyTable,
  dataMigrationTable,
  workspaceRoleTable,
} from "../../database/schema";
import { mirrorTaskPermissions } from "./mirror-task-permissions";

const COMPLETION_ID = "work-item-permissions-v1";

// Runs once: stored roles and scoped API keys replace the compiled defaults
// wholesale, so without this they would lose bug, feature and milestone access
// they had through `task`.
export async function migrateWorkItemPermissions() {
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
      const permission = mirrorTaskPermissions(row.permission);
      if (!permission) continue;
      await tx
        .update(workspaceRoleTable)
        .set({ permission })
        .where(eq(workspaceRoleTable.id, row.id));
      roles += 1;
    }

    let keys = 0;
    const keyRows = await tx
      .select({ id: apikeyTable.id, permissions: apikeyTable.permissions })
      .from(apikeyTable)
      .where(isNotNull(apikeyTable.permissions));
    for (const row of keyRows) {
      const permissions = row.permissions
        ? mirrorTaskPermissions(row.permissions)
        : null;
      if (!permissions) continue;
      await tx
        .update(apikeyTable)
        .set({ permissions })
        .where(eq(apikeyTable.id, row.id));
      keys += 1;
    }

    await tx.insert(dataMigrationTable).values({ id: COMPLETION_ID });
    if (roles > 0 || keys > 0) {
      console.log(
        `✅ Granted bug, feature and milestone permissions to ${roles} role(s) and ${keys} API key(s) from their task permissions.`,
      );
    }
  });
}
