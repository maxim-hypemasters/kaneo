import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { taskTable } from "../database/schema";
import {
  assertAuthorizedProjectSnapshot,
  lockAuthorizedProject,
} from "../milestone/access-scope";
import type { FeaturePage, FeatureScope } from "./schema";

export type FeatureTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export async function featureOwner(
  tx: FeatureTransaction,
  scope: FeatureScope,
  lock = false,
) {
  if (lock) await lockAuthorizedProject(tx, scope.projectId, scope.workspaceId);
  else
    await assertAuthorizedProjectSnapshot(
      tx,
      scope.projectId,
      scope.workspaceId,
    );
  const query = tx
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, scope.featureId));
  const [feature] = await (lock ? query.for("update") : query);
  if (!feature || feature.type !== "feature")
    throw new HTTPException(404, { message: "Feature not found" });
  if (feature.projectId !== scope.projectId)
    throw new HTTPException(409, {
      message: "Feature changed projects; retry the request",
    });
  return feature;
}
export function pagination(total: number, options: FeaturePage) {
  return {
    total,
    page: options.page,
    limit: options.limit,
    totalPages: Math.ceil(total / options.limit),
  };
}
