import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTestCaseComment } from "@/fetchers/test-case/create-test-case-comment";
import { testCaseCommentsKey } from "@/hooks/queries/test-case/test-case-keys";

export function useCreateTestCaseComment(
  projectId: string,
  testCaseId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => createTestCaseComment(testCaseId, content),
    // The socket doesn't echo a change to the window that made it. Waiting
    // for the thread keeps the form pending until it shows the result.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: testCaseCommentsKey(projectId, testCaseId),
      }),
  });
}
