import { asc, eq } from "drizzle-orm";
import db from "../database";
import { projectLinkTable } from "../database/schema";

type Database = Pick<typeof db, "select">;

export function readProjectLinks(projectId: string, database: Database = db) {
  return database
    .select()
    .from(projectLinkTable)
    .where(eq(projectLinkTable.projectId, projectId))
    .orderBy(
      asc(projectLinkTable.position),
      asc(projectLinkTable.createdAt),
      asc(projectLinkTable.id),
    );
}
