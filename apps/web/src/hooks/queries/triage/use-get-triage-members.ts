import { useQuery } from "@tanstack/react-query";
import getTriageMembers from "@/fetchers/triage/get-triage-members";

export const triageMembersKey = (projectId: string) => [
  "triage-members",
  projectId,
];

export function useGetTriageMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: triageMembersKey(projectId ?? ""),
    queryFn: () => getTriageMembers(projectId ?? ""),
    enabled: !!projectId,
    select: (data) => data.userIds,
  });
}
