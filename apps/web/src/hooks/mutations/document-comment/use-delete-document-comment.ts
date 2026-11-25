import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteDocumentComment } from "@/fetchers/document-comment/delete-document-comment";
import type {
  CommentedDocument,
  DocumentCommentThread,
} from "@/fetchers/document-comment/types";
import { documentCommentsKey } from "@/hooks/queries/document-comment/document-comment-keys";
import { withoutComment } from "./thread-cache";

export function useDeleteDocumentComment(document: CommentedDocument) {
  const queryClient = useQueryClient();
  const queryKey = documentCommentsKey(document.projectId, document.documentId);
  return useMutation({
    mutationFn: (commentId: string) =>
      deleteDocumentComment(document, commentId),
    onSuccess: (deleted) => {
      if (queryClient.getQueryData(queryKey))
        queryClient.setQueryData<DocumentCommentThread[]>(
          queryKey,
          (threads) => threads && withoutComment(threads, deleted),
        );
      else void queryClient.invalidateQueries({ queryKey });
    },
  });
}
