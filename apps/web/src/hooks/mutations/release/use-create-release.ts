import { useMutation, useQueryClient } from "@tanstack/react-query";
import createRelease, {
  type CreateReleaseInput,
} from "@/fetchers/release/create-release";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";
import { HttpError } from "@/lib/http-error";
import { invalidateReleaseLinks } from "@/lib/invalidate-release-links";
import { invalidateWorkLinkCandidates } from "@/lib/invalidate-work-link-candidates";
import { upsertRelease } from "@/lib/releases/upsert-release";
import type { Release } from "@/types/release";

type Variables = { projectId: string; data: CreateReleaseInput };

export function useCreateRelease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: Variables) =>
      createRelease(projectId, data),
    // Listed at once, so a page that opens the new release finds it.
    onSuccess: (release, { projectId, data }) => {
      queryClient.setQueryData<Release[]>(releasesKey(projectId), (releases) =>
        releases ? upsertRelease(releases, release) : releases,
      );
      if (data.milestoneIds?.length) {
        invalidateReleaseLinks(
          queryClient,
          projectId,
          data.milestoneIds.map((id) => ({ id, featureId: null })),
        );
      } else {
        void queryClient.invalidateQueries({
          queryKey: releasesKey(projectId),
        });
      }
    },
    onError: (error, { projectId }) => {
      if (
        error instanceof HttpError &&
        error.code === "MILESTONE_SELECTION_CONFLICT"
      )
        invalidateWorkLinkCandidates(queryClient, projectId);
    },
  });
}
