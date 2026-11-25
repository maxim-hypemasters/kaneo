import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTestCaseComment } from "@/fetchers/test-case/update-test-case-comment";
import { testCaseCommentsKey } from "@/hooks/queries/test-case/test-case-keys";

export function useUpdateTestCaseComment(
  projectId: string,
  testCaseId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
      content,
    }: {
      commentId: string;
      content: string;
    }) => updateTestCaseComment(testCaseId, commentId, content),
    // The socket doesn't echo a change to the window that made it. Waiting
    // for the thread keeps the form pending until it shows the result.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: testCaseCommentsKey(projectId, testCaseId),
      }),
  });
}
