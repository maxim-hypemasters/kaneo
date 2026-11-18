import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTestCase } from "@/fetchers/test-case/create-test-case";
import type { CreateTestCaseInput } from "@/fetchers/test-case/types";
import {
  testCaseKey,
  testCasesKey,
} from "@/hooks/queries/test-case/test-case-keys";

export function useCreateTestCase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTestCaseInput) =>
      createTestCase(projectId, input),
    onSuccess: (testCase) => {
      queryClient.setQueryData(testCaseKey(projectId, testCase.id), testCase);
      void queryClient.invalidateQueries({ queryKey: testCasesKey(projectId) });
    },
  });
}
