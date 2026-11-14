import { assertAuthorizedProjectSnapshot } from "../milestone/access-scope";
import { boundedTaskRead } from "../task/bounded-read";
import { findProjectDocument } from "./access";
import type { ProjectDocumentScope } from "./schema";

export async function getProjectDocument(
  scope: ProjectDocumentScope,
  id: string,
) {
  return boundedTaskRead(async (tx) => {
    await assertAuthorizedProjectSnapshot(
      tx,
      scope.projectId,
      scope.workspaceId,
    );
    return findProjectDocument(tx, scope, id);
  });
}
