import { useQuery } from "@tanstack/react-query";
import getProjectFeatures from "@/fetchers/task/get-project-features";

export function projectFeaturesKey(projectId: string) {
  return ["project-features", projectId] as const;
}

// A project's features (light, without the board), for feature pickers.
// Fetched fresh when a picker mounts: features change from other places.
export function useGetProjectFeatures(
  projectId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: projectFeaturesKey(projectId ?? ""),
    queryFn: () => getProjectFeatures(projectId ?? ""),
    enabled: enabled && !!projectId,
    refetchOnMount: "always",
  });
}
