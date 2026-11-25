import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";
import { claimProjectDescriptionAssets } from "../../task/controllers/claim-description-assets";
import { retryTransaction } from "../../utils/retry-transaction";

// Changes only the name and description, the part of a project that
// project:edit_details covers; the key, icon and visibility stay as they are.
// The description is Markdown: staged uploads it references are claimed in
// the same transaction, and uploads it no longer references are deleted.
async function updateProjectDetails(
  id: string,
  workspaceId: string,
  userId: string,
  details: { name?: string; description?: string; draftAssetIds?: string[] },
) {
  const where = and(
    eq(projectTable.id, id),
    eq(projectTable.workspaceId, workspaceId),
  );
  const changes = {
    ...(details.name !== undefined ? { name: details.name } : {}),
    ...(details.description !== undefined
      ? { description: details.description }
      : {}),
  };
  const { project, oldDescription } = await retryTransaction(() =>
    db.transaction(async (tx) => {
      // Locks the project before asset rows, as claims expect.
      const [before] = await tx
        .select({ description: projectTable.description })
        .from(projectTable)
        .where(where)
        .for("update");
      if (!before)
        throw new HTTPException(404, {
          message:
            "Project doesn't exist or doesn't belong to the specified workspace",
        });
      if (details.description !== undefined)
        await claimProjectDescriptionAssets(tx, {
          projectId: id,
          currentUserId: userId,
          description: details.description,
          draftAssetIds: details.draftAssetIds,
        });
      const [row] = Object.keys(changes).length
        ? await tx.update(projectTable).set(changes).where(where).returning()
        : await tx.select().from(projectTable).where(where);
      return { project: row!, oldDescription: before.description };
    }),
  );
  if (details.description !== undefined)
    void deleteOrphanedAssets(oldDescription, project.description, {
      projectId: id,
    }).catch(() => {});
  return project;
}

export default updateProjectDetails;
