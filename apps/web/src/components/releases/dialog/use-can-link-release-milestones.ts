import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

// Linking milestones to a new release reads the candidates and updates each
// milestone.
export function useCanLinkReleaseMilestones(enabled: boolean) {
  const { canReadMilestones, canUpdateMilestones, isCheckingPermissions } =
    useWorkspacePermission();
  return (
    enabled &&
    !isCheckingPermissions &&
    canReadMilestones() &&
    canUpdateMilestones()
  );
}
