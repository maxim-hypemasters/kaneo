import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CommentEditor from "@/components/activity/comment-editor";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { WorkspaceDeleteDialog } from "@/components/task/features/workspace/workspace-delete-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { TestCaseComment } from "@/fetchers/test-case/types";
import { useDeleteTestCaseComment } from "@/hooks/mutations/test-case/use-delete-test-case-comment";
import { useUpdateTestCaseComment } from "@/hooks/mutations/test-case/use-update-test-case-comment";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { useCommentUpload } from "./use-comment-upload";

const viewClass =
  "kaneo-comment-viewer [&_.kaneo-comment-editor-content_.ProseMirror]:pt-1.5 [&_.kaneo-comment-editor-content_.ProseMirror]:pr-3.5 [&_.kaneo-comment-editor-content_.ProseMirror]:pb-3.5 [&_.kaneo-comment-editor-content_.ProseMirror]:pl-10";
const editClass =
  "[&_.kaneo-comment-editor-content_.ProseMirror]:min-h-[3rem] [&_.kaneo-comment-editor-content_.ProseMirror]:max-h-none [&_.kaneo-comment-editor-content_.ProseMirror]:overflow-visible [&_.kaneo-comment-editor-content_.ProseMirror]:px-3 [&_.kaneo-comment-editor-content_.ProseMirror]:pt-2.5 [&_.kaneo-comment-editor-content_.ProseMirror]:pb-2";
const actionClass = "size-6 rounded-md p-0 text-muted-foreground";

// One comment. Its author, while they may still work on test cases, can edit
// or delete it.
export function TestCaseCommentCard({
  comment,
  projectId,
}: {
  comment: TestCaseComment;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canUpdateTestCases } = useWorkspacePermission();
  const update = useUpdateTestCaseComment(projectId, comment.testCaseId);
  const remove = useDeleteTestCaseComment(projectId, comment.testCaseId);
  const { uploadAsset, uploading } = useCommentUpload(comment.testCaseId);
  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const editing = draft !== null;
  const body = useRef<HTMLDivElement>(null);
  // The editor only takes focus by itself when it is created, and creating a
  // new one for the edit would report an empty text before it loads. So the
  // caret is put at the end of the existing one.
  useEffect(() => {
    if (!editing) return;
    const text = body.current?.querySelector<HTMLElement>(".ProseMirror");
    if (!text) return;
    text.focus();
    const selection = window.getSelection();
    selection?.selectAllChildren(text);
    selection?.collapseToEnd();
  }, [editing]);
  const busy = update.isPending || uploading;
  const own =
    Boolean(user?.id) &&
    user?.id === comment.author?.id &&
    canUpdateTestCases();
  const name = comment.author?.name || t("common:people.someone");
  const cancel = () => {
    setDraft(null);
    update.reset();
  };
  useDocumentDraftGuard({
    dirty: editing && draft !== comment.content,
    saving: busy || remove.isPending,
    onDiscard: cancel,
  });
  async function save() {
    if (draft === null || !draft.trim() || busy) return;
    try {
      if (draft !== comment.content)
        await update.mutateAsync({ commentId: comment.id, content: draft });
      setDraft(null);
    } catch {
      /* The edit stays for another try. */
    }
  }
  return (
    <article className="group relative w-full rounded-lg border border-border/80 bg-foreground/2">
      <header className="flex flex-wrap items-center gap-2 px-3 pt-3 pr-16">
        <Avatar className="size-5">
          <AvatarImage src={comment.author?.image ?? ""} alt="" />
          <AvatarFallback className="bg-muted font-semibold text-[9px]">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium text-[13px] text-foreground">{name}</span>
        <time
          dateTime={comment.createdAt}
          title={formatDateTime(comment.createdAt)}
          className="text-muted-foreground/60 text-xs"
        >
          {formatRelativeTime(comment.createdAt)}
        </time>
      </header>
      {own && !editing && (
        // Hover has no meaning on a touch screen, so the actions stay shown
        // there.
        <div className="absolute top-2 right-2 flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`${actionClass} hover:text-foreground`}
            aria-label={t("activity:comment.edit")}
            title={t("activity:comment.edit")}
            onClick={() => setDraft(comment.content)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`${actionClass} hover:text-destructive`}
            aria-label={t("tasks:testCases.comments.delete")}
            title={t("tasks:testCases.comments.delete")}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
      <div ref={body} className="pt-0.5">
        <CommentEditor
          value={draft ?? comment.content}
          onChange={editing ? setDraft : undefined}
          placeholder={t("activity:comment.editPlaceholder")}
          projectId={projectId}
          uploadAsset={editing ? uploadAsset : undefined}
          className={editing ? editClass : viewClass}
          readOnly={!editing}
          onSubmitShortcut={editing ? () => void save() : undefined}
          onCancelShortcut={editing ? cancel : undefined}
        />
      </div>
      {editing && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-border/70 border-t bg-card/60 px-3 py-2">
          {update.isError && (
            <p
              role="alert"
              className="mr-auto text-destructive-foreground text-sm"
            >
              {t("activity:comment.failedToUpdate")}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="xs"
            disabled={busy}
            onClick={cancel}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={busy || !draft.trim()}
            loading={update.isPending}
            onClick={() => void save()}
          >
            {t("activity:comment.save")}
          </Button>
        </div>
      )}
      <WorkspaceDeleteDialog
        open={confirming}
        title={t("tasks:testCases.comments.deleteTitle")}
        description={t("tasks:testCases.comments.deleteDescription")}
        pending={remove.isPending}
        failed={remove.isError}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) remove.reset();
        }}
        onConfirm={() =>
          remove.mutate(comment.id, { onSuccess: () => setConfirming(false) })
        }
      />
    </article>
  );
}
