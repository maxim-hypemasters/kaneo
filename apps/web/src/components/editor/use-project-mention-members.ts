import { useMemo } from "react";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";

// The people an @ can name: members with access to the project.
// Others would be offered but never notified.
export function useProjectMentionMembers(projectId: string): MentionMember[] {
  const { data: workspace } = useActiveWorkspace();
  const { data: members } = useGetProjectMembers({
    workspaceId: workspace?.id ?? "",
    projectId,
  });
  return useMemo(
    () =>
      (members ?? []).map((member) => ({
        id: member.id,
        label: member.name || member.email,
        image: member.image,
      })),
    [members],
  );
}
