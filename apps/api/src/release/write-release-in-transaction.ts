import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { releaseTable } from "../database/schema";
import { ApiError } from "../errors/api-error";
import { assertReleaseDateOrder } from "./release-dates";
import type { CreateReleaseInput, UpdateReleaseInput } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function insertReleaseInTransaction(
  tx: Tx,
  projectId: string,
  input: CreateReleaseInput,
) {
  assertReleaseDateOrder(input);
  const [created] = await tx
    .insert(releaseTable)
    .values({
      projectId,
      name: input.name,
      description: input.description ?? null,
      startDate: input.startDate,
      codeFreezeDate: input.codeFreezeDate,
      submissionDate: input.submissionDate,
    })
    .onConflictDoNothing({
      target: [releaseTable.projectId, releaseTable.name],
    })
    .returning();
  if (!created)
    throw new ApiError(409, {
      code: "RELEASE_NAME_TAKEN",
      message: "A release with this name already exists in this project",
    });
  return created;
}

// Share the normal release edit's lock/merge rules with atomic planning edits.
export async function updateReleaseInTransaction(
  tx: Tx,
  id: string,
  changes: UpdateReleaseInput,
) {
  const [current] = await tx
    .select()
    .from(releaseTable)
    .where(eq(releaseTable.id, id))
    .for("no key update");
  if (!current) throw new HTTPException(404, { message: "Release not found" });
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
  const [updated] = await tx
    .update(releaseTable)
    .set(next)
    .where(eq(releaseTable.id, id))
    .returning();
  if (!updated)
    throw new HTTPException(500, { message: "Failed to update release" });
  return updated;
}
