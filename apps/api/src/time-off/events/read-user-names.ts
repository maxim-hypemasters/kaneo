import { inArray } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";

// Display names by user id, for notification text. Null ids are skipped.
export async function readUserNames(
  ids: Array<string | null>,
): Promise<Record<string, string>> {
  const known = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (known.length === 0) return {};
  const rows = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
    .where(inArray(userTable.id, known));
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}
