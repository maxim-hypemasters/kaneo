import { count, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectLinkTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { retryTransaction } from "../../utils/retry-transaction";
import { lockProjectLinks } from "../lock-project-links";
import { MAX_PROJECT_LINKS } from "../schema";

export default async function createProjectLink({
  projectId,
  url,
  title,
}: {
  projectId: string;
  url: string;
  title: string;
}) {
  const link = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockProjectLinks(tx, projectId);
      const [existing] = await tx
        .select({ total: count(), last: max(projectLinkTable.position) })
        .from(projectLinkTable)
        .where(eq(projectLinkTable.projectId, projectId));
      if ((existing?.total ?? 0) >= MAX_PROJECT_LINKS)
        throw new HTTPException(409, {
          message: `A project can have at most ${MAX_PROJECT_LINKS} links`,
        });
      const [created] = await tx
        .insert(projectLinkTable)
        .values({
          projectId,
          url,
          title,
          position: (existing?.last ?? -1) + 1,
        })
        .returning();
      if (!created)
        throw new HTTPException(500, { message: "Failed to create link" });
      return created;
    }),
  );
  await publishEvent("project.links_updated", { projectId });
  return link;
}
