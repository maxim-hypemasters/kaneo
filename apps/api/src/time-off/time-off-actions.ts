import type { TimeOffStatus } from "./time-off-kinds";

export type TimeOffActionRow = {
  userId: string;
  status: TimeOffStatus;
  startDate: string;
};

export type TimeOffActionViewer = {
  userId: string;
  // Both flags already require workspace membership.
  canApprove: boolean;
  canCreate: boolean;
  // The server's UTC day as YYYY-MM-DD.
  today: string;
};

export type TimeOffActions = {
  canEdit: boolean;
  canCancel: boolean;
  canDecide: boolean;
};

// What the viewer may do with a request. Requesters act on their own
// requests through time_off:create; approvers act on anyone's. Approvers may
// edit or cancel approved time off at any time, while requesters may only
// cancel it through its first day (UTC). Declined and cancelled requests are
// final.
export function timeOffActions(
  row: TimeOffActionRow,
  viewer: TimeOffActionViewer,
): TimeOffActions {
  const requester = row.userId === viewer.userId && viewer.canCreate;
  switch (row.status) {
    case "pending":
      return {
        canEdit: requester || viewer.canApprove,
        canCancel: requester || viewer.canApprove,
        canDecide: viewer.canApprove,
      };
    case "approved":
      return {
        canEdit: viewer.canApprove,
        canCancel:
          viewer.canApprove || (requester && row.startDate >= viewer.today),
        canDecide: false,
      };
    default:
      return { canEdit: false, canCancel: false, canDecide: false };
  }
}
