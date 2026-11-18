import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTestCase } from "@/fetchers/test-case/update-test-case";
import type { UpdateTestCaseInput } from "@/fetchers/test-case/types";
import {
  testCaseKey,
  testCasesKey,
} from "@/hooks/queries/test-case/test-case-keys";

export function useUpdateTestCase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTestCaseInput }) =>
      updateTestCase(id, input),
    onSuccess: (testCase) => {
      queryClient.setQueryData(testCaseKey(projectId, testCase.id), testCase);
      void queryClient.invalidateQueries({ queryKey: testCasesKey(projectId) });
    },
  });
}
