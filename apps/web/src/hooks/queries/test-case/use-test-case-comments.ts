import { useQuery } from "@tanstack/react-query";
import { getTestCaseComments } from "@/fetchers/test-case/get-test-case-comments";
import { testCaseCommentsKey } from "./test-case-keys";

export function useTestCaseComments(projectId: string, testCaseId: string) {
  return useQuery({
    queryKey: testCaseCommentsKey(projectId, testCaseId),
    queryFn: () => getTestCaseComments(testCaseId),
    // Live updates only refetch a thread that is open. The app default would
    // show one invalidated while closed as current when it opens again.
    refetchOnMount: true,
  });
}
