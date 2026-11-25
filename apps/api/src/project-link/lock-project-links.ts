import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { projectTable } from "../database/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// One writer at a time per project, so two people adding or reordering links
// can't hand out the same position or slip past the limit. NO KEY UPDATE
// leaves the foreign-key checks of task and other inserts unblocked.
export async function lockProjectLinks(tx: Transaction, projectId: string) {
  const [project] = await tx
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .for("no key update");
  if (!project) throw new HTTPException(404, { message: "Project not found" });
}
