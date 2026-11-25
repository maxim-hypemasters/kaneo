import { useTranslation } from "react-i18next";
import { WorkspaceDeleteDialog } from "@/components/task/features/workspace/workspace-delete-dialog";
import { DocumentCommentsPanel } from "./document-comments-panel";
import { NewThreadCard } from "./new-thread-card";
import type { DocumentComments } from "./use-document-comments";

// The comments panel of an open document, with the comment being written and
// the question asked before a comment is deleted.
export function DocumentCommentsAside({
  comments,
}: {
  comments: DocumentComments;
}) {
  const { t } = useTranslation();
  const { deleting } = comments;
  return (
    <>
      {comments.open && (
        <DocumentCommentsPanel
          {...comments.panel}
          draft={comments.draft && <NewThreadCard {...comments.draft} />}
        />
      )}
      <WorkspaceDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) deleting?.onCancel();
        }}
        title={t(
          deleting?.thread
            ? "common:documentComments.deleteThreadTitle"
            : "common:documentComments.deleteCommentTitle",
        )}
        description={t(
          deleting?.thread
            ? "common:documentComments.deleteThreadDescription"
            : "common:documentComments.deleteCommentDescription",
        )}
        pending={deleting?.pending ?? false}
        failed={deleting?.failed ?? false}
        onConfirm={() => deleting?.onConfirm()}
      />
    </>
  );
}
