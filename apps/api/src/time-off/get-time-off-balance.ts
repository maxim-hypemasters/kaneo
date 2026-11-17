import db from "../database";
import { assertWorkspaceMember } from "./access";
import { readTimeOffBalances } from "./read-balances";
import type { TimeOffBalance } from "./summarize-balance";
import { assertCanViewMember, type TimeOffViewer } from "./viewer";

// Your own balance always reads; another member's needs approve and a
// current member.
export async function getTimeOffBalance(
  viewer: TimeOffViewer,
  query: { userId?: string; year?: number },
): Promise<TimeOffBalance> {
  const userId = query.userId ?? viewer.userId;
  assertCanViewMember(viewer, userId);
  if (userId !== viewer.userId)
    await assertWorkspaceMember(db, viewer.workspaceId, userId);
  const year = query.year ?? Number(viewer.today.slice(0, 4));
  const [balance] = await readTimeOffBalances(
    db,
    viewer.workspaceId,
    [userId],
    [year],
  );
  return balance!;
}
