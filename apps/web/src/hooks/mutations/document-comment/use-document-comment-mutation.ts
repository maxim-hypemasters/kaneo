import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CommentedDocument,
  DocumentCommentThread,
} from "@/fetchers/document-comment/types";
import { documentCommentsKey } from "@/hooks/queries/document-comment/document-comment-keys";
import { withThread } from "./thread-cache";

// For the changes that answer with the thread they changed: a new thread, a
// reply, an edit, and resolving or reopening.
export function useDocumentCommentMutation<TInput>(
  document: CommentedDocument,
  mutationFn: (input: TInput) => Promise<DocumentCommentThread>,
) {
  const queryClient = useQueryClient();
  const queryKey = documentCommentsKey(document.projectId, document.documentId);
  return useMutation({
    mutationFn,
    onSuccess: (thread) => {
      if (queryClient.getQueryData(queryKey))
        queryClient.setQueryData<DocumentCommentThread[]>(
          queryKey,
          (threads) => threads && withThread(threads, thread),
        );
      else void queryClient.invalidateQueries({ queryKey });
    },
  });
}
