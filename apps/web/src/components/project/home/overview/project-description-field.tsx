import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";
import type {
  DocumentEditorHandle,
  UploadedDocumentAsset,
} from "@/components/editor/document-editor-types";

// The description as a document: Markdown with the / command menu and, for
// editors, uploads. Everyone else reads it, or a note that there is none.
export function ProjectDescriptionField({
  ref,
  projectId,
  value,
  readOnly,
  error,
  uploadAsset,
  onChange,
}: {
  ref?: Ref<DocumentEditorHandle>;
  projectId: string;
  value: string;
  readOnly: boolean;
  error?: string;
  uploadAsset?: (file: File) => Promise<UploadedDocumentAsset>;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col">
      <DocumentEditor
        ref={ref}
        variant="page"
        documentKey={projectId}
        value={value}
        onChange={onChange}
        ariaLabel={t("tasks:projectHome.overview.description")}
        placeholder={
          readOnly
            ? t("tasks:projectHome.overview.noDescription")
            : t("common:documentEditor.slashHint")
        }
        readOnly={readOnly}
        expandable={false}
        uploadAsset={readOnly ? undefined : uploadAsset}
      />
      {error && (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
