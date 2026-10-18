import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteRelease from "@/fetchers/release/delete-release";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";
import { invalidateReleaseChange } from "@/lib/invalidate-release-change";
import type { Release } from "@/types/release";

type Variables = { id: string; projectId: string };

export function useDeleteRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: Variables) => deleteRelease(id),
    // Its items stay in the project, out of every release, each with an
    // activity entry.
    onSuccess: (_deleted, { id, projectId }) => {
      queryClient.setQueryData<Release[]>(releasesKey(projectId), (releases) =>
        releases?.filter((release) => release.id !== id),
      );
      invalidateReleaseChange(queryClient, projectId, "all");
    },
  });
}
