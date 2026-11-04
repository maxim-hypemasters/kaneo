import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { publishEvent } from "../../events";
import { pgErrorCode } from "../../utils/pg-error-code";
import type { UpdateReleaseInput } from "../schema";
import { updateReleaseInTransaction } from "../write-release-in-transaction";

const UNIQUE_VIOLATION = "23505";

// FOR NO KEY UPDATE leaves the FOR KEY SHARE locks that task writes take on
// the release free, so an edit that keeps the name doesn't wait on
// membership changes. A rename changes a unique key, so its UPDATE takes FOR
// UPDATE and waits for membership transactions in flight on this release;
// it locks no task rows, so it can't deadlock with them.
async function updateRelease(id: string, changes: UpdateReleaseInput) {
  const updated = await db
    .transaction((tx) => updateReleaseInTransaction(tx, id, changes))
    .catch((error: unknown) => {
      if (pgErrorCode(error) === UNIQUE_VIOLATION) {
        throw new HTTPException(409, {
          message: "A release with this name already exists in this project",
        });
      }
      throw error;
    });

  await publishEvent("release.changed", { projectId: updated.projectId });

  return updated;
}

export default updateRelease;
