import {
  type TimeOffActionRow,
  type TimeOffActionViewer,
  timeOffActions,
} from "./time-off-actions";
import {
  missingTimeOffPermission,
  timeOffChangedError,
  timeOffNotFound,
  timeOffStartedError,
  timeOffStatusError,
} from "./time-off-errors";

type Row = TimeOffActionRow & { version: number };

// Other people's requests exist only for approvers; for everyone else they
// read like an unknown id.
export function assertTimeOffVisible(
  row: TimeOffActionRow,
  viewer: TimeOffActionViewer,
) {
  if (row.userId !== viewer.userId && !viewer.canApprove)
    throw timeOffNotFound();
}

function assertOpen(row: TimeOffActionRow) {
  if (row.status === "declined" || row.status === "cancelled")
    throw timeOffStatusError(row.status);
}

// The row is visible and locked. A requester who finds their request already
// approved hears that, since only approvers change approved time off.
export function assertCanEdit(
  row: TimeOffActionRow,
  viewer: TimeOffActionViewer,
) {
  assertOpen(row);
  if (timeOffActions(row, viewer).canEdit) return;
  if (row.status === "approved" && viewer.canCreate)
    throw timeOffStatusError("approved");
  throw missingTimeOffPermission(
    row.status === "approved" ? "approve" : "create",
  );
}

// A requester may cancel approved time off only through its first day (UTC).
export function assertCanCancel(
  row: TimeOffActionRow,
  viewer: TimeOffActionViewer,
) {
  assertOpen(row);
  if (timeOffActions(row, viewer).canCancel) return;
  if (row.status === "approved" && viewer.canCreate)
    throw timeOffStartedError();
  throw missingTimeOffPermission(
    row.status === "approved" ? "approve" : "create",
  );
}

// Approvers decide the version they reviewed; an edit since then must be
// reviewed again.
export function assertCanDecide(
  row: Row,
  viewer: TimeOffActionViewer,
  version: number,
) {
  if (row.status !== "pending") throw timeOffStatusError(row.status);
  if (row.version !== version) throw timeOffChangedError();
  if (!timeOffActions(row, viewer).canDecide)
    throw missingTimeOffPermission("approve");
}
