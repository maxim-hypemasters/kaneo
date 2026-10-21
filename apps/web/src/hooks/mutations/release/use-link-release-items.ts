import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ReleaseLinkCandidate,
  ReleaseLinkKind,
} from "@/fetchers/release/get-release-link-candidates";
import { linkReleaseItems } from "@/fetchers/release/link-release-items";
import { invalidateReleaseLinks } from "@/lib/invalidate-release-links";

export function useLinkReleaseItems(
  projectId: string,
  releaseId: string,
  kind: ReleaseLinkKind,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (candidates: ReleaseLinkCandidate[]) =>
      linkReleaseItems(releaseId, kind, candidates),
    onSettled: (_data, _error, candidates) =>
      invalidateReleaseLinks(client, projectId, candidates),
  });
}
