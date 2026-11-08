import { skipToken, useQuery } from "@tanstack/react-query";
import globalSearch, { type SearchType } from "@/fetchers/search/global-search";

type SearchParams = {
  q: string;
  type?: SearchType;
  workspaceId: string | undefined;
  projectId?: string;
  limit?: number;
};

function useGlobalSearch({ workspaceId, ...params }: SearchParams) {
  return useQuery({
    queryKey: ["search", { ...params, workspaceId }],
    queryFn: workspaceId
      ? () => globalSearch({ ...params, workspaceId })
      : skipToken,
    enabled: !!params.q && params.q.length >= 1,
    staleTime: 1000 * 30, // 30 seconds
  });
}

export default useGlobalSearch;
