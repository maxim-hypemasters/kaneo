import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateRelease, {
  type UpdateReleaseInput,
} from "@/fetchers/release/update-release";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";
import { upsertRelease } from "@/lib/releases/upsert-release";
import type { Release } from "@/types/release";

type Variables = { id: string; projectId: string; data: UpdateReleaseInput };

export function useUpdateRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: Variables) => updateRelease(id, data),
    onSuccess: (release, { projectId }) => {
      queryClient.setQueryData<Release[]>(releasesKey(projectId), (releases) =>
        releases ? upsertRelease(releases, release) : releases,
      );
      void queryClient.invalidateQueries({ queryKey: releasesKey(projectId) });
    },
  });
}
