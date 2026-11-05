import { useTranslation } from "react-i18next";
import type { uploadTaskImage } from "@/lib/upload-task-image";
import { DocumentEditor } from "@/components/editor/document-editor";

type TaskDescriptionEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  uploadAsset?: (
    file: File,
  ) => Promise<Awaited<ReturnType<typeof uploadTaskImage>>>;
  disabled?: boolean;
};

export default function TaskDescriptionEditor({
  value,
  onChange,
  placeholder,
  uploadAsset,
  disabled,
}: TaskDescriptionEditorProps) {
  const { t } = useTranslation();

  return (
    <DocumentEditor
      value={value}
      onChange={onChange}
      ariaLabel={t("common:documentEditor.description")}
      placeholder={placeholder ?? t("tasks:detail.addDescription")}
      uploadAsset={uploadAsset}
      disabled={disabled}
    />
  );
}
