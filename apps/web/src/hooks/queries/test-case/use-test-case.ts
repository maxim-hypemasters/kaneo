import { useQuery } from "@tanstack/react-query";
import { getTestCase } from "@/fetchers/test-case/get-test-case";
import { testCaseKey } from "./test-case-keys";

export function useTestCase(projectId: string, id: string | null) {
  return useQuery({
    queryKey: testCaseKey(projectId, id ?? ""),
    queryFn: () => getTestCase(id ?? ""),
    enabled: Boolean(projectId && id),
  });
}
