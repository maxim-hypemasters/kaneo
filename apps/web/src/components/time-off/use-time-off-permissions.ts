import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export type TimeOffPermissions = {
  // See who is away and when (time_off:read).
  canView: boolean;
  // Request time off and edit or cancel your own requests (time_off:create).
  canRequest: boolean;
  // Decide requests, see everyone's details and balances, record time off
  // for others and set allowances (time_off:approve).
  canApprove: boolean;
  isChecking: boolean;
};

// Nothing is allowed while the check runs, so controls don't flash on and
// off; the API enforces all of it.
export function useTimeOffPermissions(): TimeOffPermissions {
  const {
    canReadTimeOff,
    canRequestTimeOff,
    canApproveTimeOff,
    isCheckingPermissions,
  } = useWorkspacePermission();
  const ready = !isCheckingPermissions;
  return {
    canView: ready && canReadTimeOff(),
    canRequest: ready && canRequestTimeOff(),
    canApprove: ready && canApproveTimeOff(),
    isChecking: isCheckingPermissions,
  };
}
