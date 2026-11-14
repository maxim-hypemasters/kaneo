import { useMutation, useQueryClient } from "@tanstack/react-query";
import { moveProjectDocument } from "@/fetchers/project-document/move-project-document";
import type { ProjectDocumentTree } from "@/fetchers/project-document/types";
import { projectDocumentsKey } from "@/hooks/queries/project-document/project-document-keys";
import { applyPageMove } from "./apply-page-move";

type Move = { id: string; parentId: string | null; index: number };

// Moves the page in the cached tree right away and puts it back if the
// server refuses.
export function useMoveProjectDocument(projectId: string) {
  const queryClient = useQueryClient();
  const key = projectDocumentsKey(projectId);
  return useMutation({
    mutationFn: ({ id, parentId, index }: Move) =>
      moveProjectDocument(id, { parentId, index }),
    onMutate: async ({ id, parentId, index }: Move) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const previous = queryClient.getQueryData<ProjectDocumentTree>(key);
      if (previous)
        queryClient.setQueryData<ProjectDocumentTree>(key, {
          ...previous,
          pages: applyPageMove(previous.pages, id, parentId, index),
        });
      return { previous };
    },
    onError: (_error, _move, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: key, exact: true }),
  });
}
