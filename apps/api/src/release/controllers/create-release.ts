import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { releaseTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { assertReleaseDateOrder } from "../release-dates";
import type { CreateReleaseInput } from "../schema";

async function createRelease(projectId: string, input: CreateReleaseInput) {
  assertReleaseDateOrder(input);

  const [created] = await db
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

  if (!created) {
    throw new HTTPException(409, {
      message: "A release with this name already exists in this project",
    });
  }

  await publishEvent("release.changed", { projectId });

  return created;
}

export default createRelease;
