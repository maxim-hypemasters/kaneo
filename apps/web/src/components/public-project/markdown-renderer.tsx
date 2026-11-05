import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const { t } = useTranslation();
  return (
    <DocumentEditor
      value={content}
      ariaLabel={t("common:documentEditor.description")}
      readOnly
    />
  );
}
