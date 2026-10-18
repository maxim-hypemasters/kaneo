import db, { schema } from "../../../../apps/api/src/database";

let lastNumber = 0;

// Tasks inserted directly, with release_id set in SQL where a test needs it.
export async function insertTask(
  projectId: string,
  values: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  lastNumber += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: `Task ${lastNumber}`,
      number: lastNumber,
      status: "to-do",
      ...values,
    })
    .returning();
  if (!task) throw new Error("Failed to insert task");
  return task;
}
