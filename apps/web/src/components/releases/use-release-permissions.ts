import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export type ReleasePermissions = {
  // Create and edit releases (project:update).
  canManage: boolean;
  // Move unfinished items (task:update).
  canMoveItems: boolean;
  // Deleting unlinks every item, so it needs both.
  canDelete: boolean;
  canCreateTasks: boolean;
};

// What the release pages offer. Nothing shows while the check runs, so
// controls don't flash on and off; the API enforces all of it.
export function useReleasePermissions(): ReleasePermissions {
  const {
    canUpdateProjects,
    canUpdateTasks,
    canUpdateBugs,
    canUpdateMilestones,
    canCreateWorkItems,
    isCheckingPermissions,
  } = useWorkspacePermission();
  const ready = !isCheckingPermissions;
  const canManage = ready && canUpdateProjects();
  // Releases move tasks, bugs and milestones together.
  const canMoveItems =
    ready && canUpdateTasks() && canUpdateBugs() && canUpdateMilestones();
  return {
    canManage,
    canMoveItems,
    canDelete: canManage && canMoveItems,
    canCreateTasks: ready && canCreateWorkItems(),
  };
}
