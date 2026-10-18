import { useMutation, useQueryClient } from "@tanstack/react-query";
import moveUnfinished from "@/fetchers/release/move-unfinished";
import { invalidateReleaseChange } from "@/lib/invalidate-release-change";

type Variables = {
  id: string;
  projectId: string;
  // null takes the items out of every release.
  targetReleaseId: string | null;
};

export function useMoveUnfinished() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, targetReleaseId }: Variables) =>
      moveUnfinished(id, targetReleaseId),
    onSuccess: ({ movedTaskIds }, { projectId }) => {
      invalidateReleaseChange(queryClient, projectId, movedTaskIds);
    },
  });
}
