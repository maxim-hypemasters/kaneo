import { randomUUID } from "node:crypto";
import db, { schema } from "../../../../apps/api/src/database";

export async function insertRelease(
  projectId: string,
  values: Partial<typeof schema.releaseTable.$inferInsert> = {},
) {
  const [release] = await db
    .insert(schema.releaseTable)
    .values({
      projectId,
      name: `Release ${randomUUID().slice(0, 8)}`,
      startDate: "2026-10-01",
      codeFreezeDate: "2026-10-15",
      submissionDate: "2026-10-20",
      ...values,
    })
    .returning();
  if (!release) throw new Error("Failed to insert release");
  return release;
}
