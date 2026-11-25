import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectLinkTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { retryTransaction } from "../../utils/retry-transaction";
import { applyLinkOrder } from "../apply-link-order";
import { lockProjectLinks } from "../lock-project-links";
import { readProjectLinks } from "../read-project-links";

export default async function reorderProjectLinks({
  projectId,
  links,
}: {
  projectId: string;
  links: Array<{ id: string; position: number }>;
}) {
  const ids = links.map((link) => link.id);
  if (new Set(ids).size !== ids.length)
    throw new HTTPException(400, {
      message: "Duplicate link ids in reorder payload",
    });

  const reordered = await retryTransaction(() =>
    db.transaction(async (tx) => {
      await lockProjectLinks(tx, projectId);
      const existing = await readProjectLinks(projectId, tx);

      // Check the whole batch before writing, so a foreign id can't leave the
      // project half-renumbered.
      const owned = new Set(existing.map((link) => link.id));
      const foreignId = ids.find((id) => !owned.has(id));
      if (foreignId)
        throw new HTTPException(400, {
          message: `Link ${foreignId} does not belong to this project`,
        });

      const current = new Map(existing.map((link) => [link.id, link.position]));
      const order = applyLinkOrder(
        existing.map((link) => link.id),
        links,
      );
      for (const [position, id] of order.entries()) {
        if (current.get(id) === position) continue;
        await tx
          .update(projectLinkTable)
          .set({ position })
          .where(eq(projectLinkTable.id, id));
      }
      return readProjectLinks(projectId, tx);
    }),
  );
  await publishEvent("project.links_updated", { projectId });
  return reordered;
}
