import { useMutation, useQueryClient } from "@tanstack/react-query";
import replaceTriageMembers from "@/fetchers/triage/replace-triage-members";
import { triageMembersKey } from "@/hooks/queries/triage/use-get-triage-members";

export function useReplaceTriageMembers(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) => replaceTriageMembers(projectId, userIds),
    onSuccess: (data) =>
      queryClient.setQueryData(triageMembersKey(projectId), data),
  });
}
