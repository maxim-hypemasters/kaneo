import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

// Nothing is allowed while the check runs, so controls don't flash on and
// off. The API enforces the same permissions.
export function useTeamPermissions() {
  const {
    canCreateTeams,
    canUpdateTeams,
    canDeleteTeams,
    isCheckingPermissions,
  } = useWorkspacePermission();
  const ready = !isCheckingPermissions;
  return {
    canCreate: ready && canCreateTeams(),
    canUpdate: ready && canUpdateTeams(),
    canDelete: ready && canDeleteTeams(),
  };
}
