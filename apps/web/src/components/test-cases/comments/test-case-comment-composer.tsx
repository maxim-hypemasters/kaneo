import { ArrowUp, Paperclip } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import CommentEditor from "@/components/activity/comment-editor";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { Button } from "@/components/ui/button";
import { useCreateTestCaseComment } from "@/hooks/mutations/test-case/use-create-test-case-comment";
import { useCommentUpload } from "./use-comment-upload";

const editorClass =
  "[&_.kaneo-comment-editor-content_.ProseMirror]:min-h-[3rem] [&_.kaneo-comment-editor-content_.ProseMirror]:max-h-none [&_.kaneo-comment-editor-content_.ProseMirror]:overflow-visible [&_.kaneo-comment-editor-content_.ProseMirror]:px-3 [&_.kaneo-comment-editor-content_.ProseMirror]:pt-3 [&_.kaneo-comment-editor-content_.ProseMirror]:pb-2";

export function TestCaseCommentComposer({
  testCaseId,
  projectId,
}: {
  testCaseId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [attach, setAttach] = useState<(() => void) | null>(null);
  // The editor reports its attach action from an effect keyed on this
  // callback, so it has to keep its identity.
  const keepAttach = useCallback(
    (next: (() => void) | null) => setAttach(() => next),
    [],
  );
  const create = useCreateTestCaseComment(projectId, testCaseId);
  const { uploadAsset, uploading } = useCommentUpload(testCaseId);
  const busy = create.isPending || uploading;
  // Closing the test case with an unsent comment asks first.
  useDocumentDraftGuard({
    dirty: Boolean(content.trim()),
    saving: busy,
    onDiscard: () => {
      setContent("");
      create.reset();
    },
  });
  async function submit() {
    if (!content.trim() || busy) return;
    try {
      await create.mutateAsync(content);
      setContent("");
    } catch {
      /* The text stays for another try. */
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border border-border/80 bg-card/70 transition-colors focus-within:border-ring/60 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_20%,transparent)]">
        {/* Not locked while sending: unlocking makes the editor report its
            text again, which can put the sent comment back in the box. */}
        <CommentEditor
          value={content}
          onChange={setContent}
          placeholder={t("activity:comment.leavePlaceholder")}
          projectId={projectId}
          uploadAsset={uploadAsset}
          showQuickAttachButton={false}
          onAttachActionChange={keepAttach}
          onSubmitShortcut={() => void submit()}
          className={editorClass}
        />
        <div className="flex items-center justify-end gap-2 border-border/70 border-t px-2 py-2">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            disabled={!attach || busy}
            aria-label={t("activity:comment.attachFile")}
            onClick={() => attach?.()}
          >
            <Paperclip className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={!content.trim() || busy}
            loading={create.isPending}
            aria-label={t("tasks:testCases.comments.post")}
            onClick={() => void submit()}
          >
            <ArrowUp className="size-3.5" />
          </Button>
        </div>
      </div>
      {create.isError && (
        <p role="alert" className="text-destructive-foreground text-sm">
          {t("activity:comment.failedToAdd")}
        </p>
      )}
    </div>
  );
}
