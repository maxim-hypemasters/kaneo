import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";

// Changes only the name and description, the part of a project that
// project:edit_details covers; the key, icon and visibility stay as they are.
async function updateProjectDetails(
  id: string,
  workspaceId: string,
  details: { name?: string; description?: string },
) {
  const where = and(
    eq(projectTable.id, id),
    eq(projectTable.workspaceId, workspaceId),
  );
  const changes = {
    ...(details.name !== undefined ? { name: details.name } : {}),
    ...(details.description !== undefined
      ? { description: details.description }
      : {}),
  };
  const [project] = Object.keys(changes).length
    ? await db.update(projectTable).set(changes).where(where).returning()
    : await db.select().from(projectTable).where(where);
  if (!project)
    throw new HTTPException(404, {
      message:
        "Project doesn't exist or doesn't belong to the specified workspace",
    });
  return project;
}

export default updateProjectDetails;
