import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceUserTable } from "../../database/schema";
import { workspaceMembersWithPermission } from "../../utils/workspace-members-with-permission";
import { broadcastToUser } from "../../ws";
import {
  type TimeOffAudienceChange,
  timeOffAudience,
  timeOffAudienceRecipients,
} from "../time-off-audience";

// Tells each member who may see the change to refetch. The message carries no
// data: clients reload through the permission-checked routes.
export async function broadcastTimeOffChange(
  workspaceId: string,
  change: TimeOffAudienceChange,
  requesterId: string | null,
) {
  const audience = timeOffAudience(change);
  const members = await db
    .select({ userId: workspaceUserTable.userId })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.workspaceId, workspaceId));
  const approverIds =
    audience === "approvers"
      ? await workspaceMembersWithPermission(workspaceId, {
          time_off: ["approve"],
        })
      : [];
  const recipients = timeOffAudienceRecipients({
    audience,
    memberIds: members.map((member) => member.userId),
    approverIds,
    requesterId,
  });
  for (const userId of recipients)
    broadcastToUser(userId, { type: "TIME_OFF_UPDATED", workspaceId });
}
