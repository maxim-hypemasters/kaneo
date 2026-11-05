import { asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { assetTable, projectTable } from "../../database/schema";
import { extractAssetIds } from "../../storage/cleanup-assets";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function claimDescriptionAssets(
  tx: Transaction,
  {
    taskId,
    projectId,
    currentUserId,
    description,
    draftAssetIds = [],
  }: {
    taskId: string;
    projectId: string;
    currentUserId: string;
    description?: string;
    draftAssetIds?: string[];
  },
) {
  const referenced = extractAssetIds(description);
  const ids = [...new Set(draftAssetIds)].filter((id) => referenced.has(id));
  if (!ids.length) return;

  // Callers lock the project before task and asset rows, including creation.
  const project = await tx.query.projectTable.findFirst({
    columns: { workspaceId: true },
    where: eq(projectTable.id, projectId),
  });
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  const assets = await tx
    .select()
    .from(assetTable)
    .where(inArray(assetTable.id, ids))
    .orderBy(asc(assetTable.id))
    .for("update");
  if (
    assets.length !== ids.length ||
    assets.some(
      (asset) =>
        asset.projectId !== projectId ||
        asset.createdBy !== currentUserId ||
        asset.surface !== "draft" ||
        asset.taskId !== null,
    )
  )
    throw new HTTPException(400, {
      message:
        "Some staged uploads are unavailable or belong to another owner/project",
    });
  await tx
    .update(assetTable)
    .set({ taskId, surface: "description", workspaceId: project.workspaceId })
    .where(inArray(assetTable.id, ids));
}
