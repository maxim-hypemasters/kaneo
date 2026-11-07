import { useState } from "react";
import { useTranslation } from "react-i18next";
import CommentEditor from "@/components/activity/comment-editor";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { Button } from "@/components/ui/button";
import createComment from "@/fetchers/comment/create-comment";
import { useFeatureWorkspaceMutation } from "@/hooks/mutations/feature/use-feature-workspace-mutation";
import { uploadTaskImage } from "@/lib/upload-task-image";

export function FeatureCommentComposer({
  featureId,
  projectId,
}: {
  featureId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const mutation = useFeatureWorkspaceMutation(
    projectId,
    featureId,
    createComment,
  );
  useDocumentDraftGuard({
    dirty: Boolean(content.trim()),
    saving: mutation.isPending || uploading,
    onDiscard: () => {
      setContent("");
      mutation.reset();
    },
  });
  async function submit() {
    if (!content.trim() || mutation.isPending || uploading) return;
    try {
      await mutation.mutateAsync({ taskId: featureId, comment: content });
      setContent("");
    } catch {
      /* Preserve text for retry. */
    }
  }
  return (
    <div className="space-y-3">
      <CommentEditor
        value={content}
        onChange={setContent}
        disabled={mutation.isPending}
        placeholder={t("activity:comment.leavePlaceholder")}
        taskId={featureId}
        projectId={projectId}
        uploadSurface="comment"
        onSubmitShortcut={() => void submit()}
        uploadAsset={async (file) => {
          setUploading(true);
          try {
            return await uploadTaskImage({
              taskId: featureId,
              file,
              surface: "comment",
            });
          } finally {
            setUploading(false);
          }
        }}
      />
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("activity:comment.failedToAdd")}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!content.trim() || mutation.isPending || uploading}
          onClick={() => void submit()}
          loading={mutation.isPending}
        >
          {t("tasks:features.workspace.postComment")}
        </Button>
      </div>
    </div>
  );
}
