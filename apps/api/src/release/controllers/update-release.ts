import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { releaseTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { pgErrorCode } from "../../utils/pg-error-code";
import { assertReleaseDateOrder } from "../release-dates";
import type { UpdateReleaseInput } from "../schema";

const UNIQUE_VIOLATION = "23505";

// FOR NO KEY UPDATE leaves the FOR KEY SHARE locks that task writes take on
// the release free, so an edit that keeps the name doesn't wait on
// membership changes. A rename changes a unique key, so its UPDATE takes FOR
// UPDATE and waits for membership transactions in flight on this release;
// it locks no task rows, so it can't deadlock with them.
async function updateRelease(id: string, changes: UpdateReleaseInput) {
  const updated = await db
    .transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(releaseTable)
        .where(eq(releaseTable.id, id))
        .for("no key update");
      if (!current) {
        throw new HTTPException(404, { message: "Release not found" });
      }

      const next = {
        name: changes.name ?? current.name,
        description:
          changes.description === undefined
            ? current.description
            : changes.description,
        startDate: changes.startDate ?? current.startDate,
        codeFreezeDate: changes.codeFreezeDate ?? current.codeFreezeDate,
        submissionDate: changes.submissionDate ?? current.submissionDate,
      };
      assertReleaseDateOrder(next);

      const [row] = await tx
        .update(releaseTable)
        .set(next)
        .where(eq(releaseTable.id, id))
        .returning();
      if (!row) {
        throw new HTTPException(500, { message: "Failed to update release" });
      }
      return row;
    })
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
