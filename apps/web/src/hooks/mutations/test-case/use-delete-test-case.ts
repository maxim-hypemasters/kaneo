import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteTestCase } from "@/fetchers/test-case/delete-test-case";
import {
  testCaseKey,
  testCasesKey,
} from "@/hooks/queries/test-case/test-case-keys";

export function useDeleteTestCase(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTestCase(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: testCaseKey(projectId, id) });
      void queryClient.invalidateQueries({ queryKey: testCasesKey(projectId) });
    },
  });
}
