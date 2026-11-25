import { useQuery } from "@tanstack/react-query";
import { getDocumentComments } from "@/fetchers/document-comment/get-document-comments";
import type { CommentedDocument } from "@/fetchers/document-comment/types";
import { documentCommentsKey } from "./document-comment-keys";

export function useDocumentCommentThreads(document: CommentedDocument) {
  return useQuery({
    queryKey: documentCommentsKey(document.projectId, document.documentId),
    queryFn: () => getDocumentComments(document),
    staleTime: 30_000,
  });
}
