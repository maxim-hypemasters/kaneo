import type { ImportedRelease } from "@kaneo/importers";
import { HTTPException } from "hono/http-exception";
import type db from "../../database";
import { releaseTable } from "../../database/schema";
import { transferReleaseSchema } from "../../task/transfers/schema";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function writeImportReleases(
  tx: Tx,
  projectId: string,
  releases: readonly ImportedRelease[] = [],
) {
  const ids = new Map<string, string>();
  if (
    new Set(releases.map((release) => release.key)).size !== releases.length ||
    new Set(releases.map((release) => release.name)).size !== releases.length
  )
    throw new HTTPException(400, {
      message: "Release keys and names must be unique",
    });
  for (const release of releases) {
    const parsed = transferReleaseSchema.safeParse(release);
    if (!parsed.success)
      throw new HTTPException(400, { message: "Invalid imported release" });
    const { key, ...fields } = parsed.data;
    const [row] = await tx
      .insert(releaseTable)
      .values({ projectId, ...fields })
      .returning({ id: releaseTable.id });
    ids.set(key, row!.id);
  }
  return ids;
}
