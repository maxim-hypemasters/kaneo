import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTestCaseComment } from "@/fetchers/test-case/delete-test-case-comment";
import { testCaseCommentsKey } from "@/hooks/queries/test-case/test-case-keys";

export function useDeleteTestCaseComment(
  projectId: string,
  testCaseId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      deleteTestCaseComment(testCaseId, commentId),
    // The socket doesn't echo a change to the window that made it. Waiting
    // for the thread keeps the form pending until it shows the result.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: testCaseCommentsKey(projectId, testCaseId),
      }),
  });
}
