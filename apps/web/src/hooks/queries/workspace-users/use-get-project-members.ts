import { useQuery } from "@tanstack/react-query";
import getProjectMembers from "@/fetchers/workspace-user/get-project-members";

function useGetProjectMembers({
  workspaceId,
  projectId,
  enabled = true,
}: {
  workspaceId: string;
  projectId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ["workspace-users", workspaceId, "project", projectId],
    queryFn: () => getProjectMembers({ workspaceId, projectId }),
    enabled: enabled && !!workspaceId && !!projectId,
  });
}

export default useGetProjectMembers;
