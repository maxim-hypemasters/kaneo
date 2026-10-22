import { useEffect, useState } from "react";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export function useCanLinkReleaseMilestones(enabled: boolean) {
  const {
    canUpdateTasks,
    hasPermission,
    isCheckingPermissions,
    workspace,
    role,
  } = useWorkspacePermission();
  const [readGrant, setReadGrant] = useState<{
    workspaceId: string | undefined;
    role: string | undefined;
    check: typeof hasPermission;
    allowed: boolean;
  } | null>(null);
  const canUpdate = !isCheckingPermissions && canUpdateTasks();

  useEffect(() => {
    let active = true;
    setReadGrant(null);
    if (enabled && canUpdate) {
      void hasPermission({ task: ["read"] })
        .then((allowed) => {
          if (active)
            setReadGrant({
              workspaceId: workspace?.id,
              role,
              check: hasPermission,
              allowed,
            });
        })
        .catch(() => {
          if (active) setReadGrant(null);
        });
    }
    return () => {
      active = false;
    };
  }, [enabled, canUpdate, hasPermission, workspace?.id, role]);

  return (
    enabled &&
    canUpdate &&
    readGrant?.workspaceId === workspace?.id &&
    readGrant?.role === role &&
    readGrant?.check === hasPermission &&
    readGrant.allowed
  );
}
