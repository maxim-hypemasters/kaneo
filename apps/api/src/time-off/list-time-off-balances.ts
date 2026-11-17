import { asc, eq } from "drizzle-orm";
import db from "../database";
import { workspaceUserTable } from "../database/schema";
import { readDefaultAllowances, readTimeOffBalances } from "./read-balances";
import { assertTimeOffApprover, type TimeOffViewer } from "./viewer";

// Every current member's balance for one year, with the workspace default of
// each type.
export async function listTimeOffBalances(
  viewer: TimeOffViewer,
  query: { year?: number },
) {
  assertTimeOffApprover(viewer);
  const year = query.year ?? Number(viewer.today.slice(0, 4));
  const members = await db
    .selectDistinct({ userId: workspaceUserTable.userId })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.workspaceId, viewer.workspaceId))
    .orderBy(asc(workspaceUserTable.userId));
  return {
    workspaceId: viewer.workspaceId,
    year,
    defaultAllowances: await readDefaultAllowances(db, viewer.workspaceId),
    members: await readTimeOffBalances(
      db,
      viewer.workspaceId,
      members.map((member) => member.userId),
      [year],
    ),
  };
}
