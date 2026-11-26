import { useTranslation } from "react-i18next";
import type { uploadTaskImage } from "@/lib/upload-task-image";
import { DocumentEditor } from "@/components/editor/document-editor";
import { useProjectMentionMembers } from "@/components/editor/use-project-mention-members";

type TaskDescriptionEditorProps = {
  // The project the task goes to, whose members an @ can name.
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  uploadAsset?: (
    file: File,
  ) => Promise<Awaited<ReturnType<typeof uploadTaskImage>>>;
  disabled?: boolean;
};

export default function TaskDescriptionEditor({
  projectId,
  value,
  onChange,
  placeholder,
  uploadAsset,
  disabled,
}: TaskDescriptionEditorProps) {
  const { t } = useTranslation();
  const mentionMembers = useProjectMentionMembers(projectId);

  return (
    <DocumentEditor
      value={value}
      mentionMembers={mentionMembers}
      onChange={onChange}
      ariaLabel={t("common:documentEditor.description")}
      placeholder={placeholder ?? t("tasks:detail.addDescription")}
      uploadAsset={uploadAsset}
      disabled={disabled}
    />
  );
}
