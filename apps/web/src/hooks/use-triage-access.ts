import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { useGetTriageMembers } from "@/hooks/queries/triage/use-get-triage-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { canTriage, routesToTriage } from "@/lib/triage/can-triage";

// What the current user may do with a project's Triage. The API enforces it.
export function useTriageAccess(projectId: string | undefined) {
  const { user } = useAuth();
  const { data: memberIds } = useGetTriageMembers(projectId);
  const { canUpdateProjects, isCheckingPermissions } = useWorkspacePermission();
  const canManage = !isCheckingPermissions && canUpdateProjects();
  return {
    memberIds,
    enabled: !!memberIds?.length,
    canManage,
    canTriage: canTriage({
      userId: user?.id,
      memberIds,
      canUpdateProjects: canManage,
    }),
    routesToTriage: routesToTriage(user?.id, memberIds),
  };
}
