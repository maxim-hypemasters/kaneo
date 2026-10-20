import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { projectTable } from "../database/schema";
import type { MilestoneTransaction } from "./membership";

// Project moves explicitly lock this row FOR UPDATE. Keep the authorized
// workspace stable until the milestone transaction has finished.
export async function lockAuthorizedProject(
  database: Pick<MilestoneTransaction, "select">,
  projectId: string | undefined,
  workspaceId: string | undefined,
  mode: "key share" | "update" = "key share",
) {
  if (!projectId || !workspaceId) return;
  const [project] = await database
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .for(mode);
  if (!project)
    throw new HTTPException(409, {
      message: "Project changed workspaces; retry the request",
    });
}

// Read-only aggregate endpoints validate authorization against their snapshot;
// row-locking reads are not permitted inside a read-only transaction.
export async function assertAuthorizedProjectSnapshot(
  database: Pick<MilestoneTransaction, "select">,
  projectId: string,
  workspaceId: string | undefined,
) {
  if (!workspaceId) return;
  const [project] = await database
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    );
  if (!project)
    throw new HTTPException(409, {
      message: "Project changed workspaces; retry the request",
    });
}
