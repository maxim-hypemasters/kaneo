import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectLinkTable } from "../../database/schema";
import { publishEvent } from "../../events";

export default async function updateProjectLink({
  projectId,
  id,
  url,
  title,
}: {
  projectId: string;
  id: string;
  url?: string;
  title?: string;
}) {
  // Bound to the authorized project, so a link id from another project
  // matches nothing.
  const [updated] = await db
    .update(projectLinkTable)
    .set({
      ...(url === undefined ? {} : { url }),
      ...(title === undefined ? {} : { title }),
    })
    .where(
      and(
        eq(projectLinkTable.id, id),
        eq(projectLinkTable.projectId, projectId),
      ),
    )
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Link not found" });

  await publishEvent("project.links_updated", { projectId });
  return updated;
}
