import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectLinkTable } from "../../database/schema";
import { publishEvent } from "../../events";

export default async function deleteProjectLink({
  projectId,
  id,
}: {
  projectId: string;
  id: string;
}) {
  // Bound to the authorized project, so a link id from another project
  // matches nothing.
  const [deleted] = await db
    .delete(projectLinkTable)
    .where(
      and(
        eq(projectLinkTable.id, id),
        eq(projectLinkTable.projectId, projectId),
      ),
    )
    .returning({ id: projectLinkTable.id });
  if (!deleted) throw new HTTPException(404, { message: "Link not found" });

  await publishEvent("project.links_updated", { projectId });
  return deleted;
}
