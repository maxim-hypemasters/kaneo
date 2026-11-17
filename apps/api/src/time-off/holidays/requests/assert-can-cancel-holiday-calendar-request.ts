import type { TimeOffActionViewer } from "../../time-off-actions";
import { missingTimeOffPermission } from "../../time-off-errors";

// The member withdraws their own request with time_off:create; approvers
// cancel anyone's.
export function assertCanCancelHolidayCalendarRequest(
  row: { userId: string },
  viewer: TimeOffActionViewer,
) {
  if (viewer.canApprove) return;
  if (row.userId !== viewer.userId) throw missingTimeOffPermission("approve");
  if (!viewer.canCreate) throw missingTimeOffPermission("create");
}
