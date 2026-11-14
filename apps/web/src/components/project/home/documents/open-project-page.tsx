import { useTranslation } from "react-i18next";
import { DocumentWindow } from "@/components/documents/document-window";
import { WorkspaceQueryState } from "@/components/task/features/workspace/workspace-query-state";
import { useProjectDocument } from "@/hooks/queries/project-document/use-project-document";
import { ProjectDocumentPage } from "./project-document-page";

export function OpenProjectPage({
  projectId,
  documentId,
  subPageCount,
  focusTitle,
  onBack,
}: {
  projectId: string;
  documentId: string;
  subPageCount: number;
  focusTitle: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const document = useProjectDocument(projectId, documentId);
  if (document.data)
    return (
      <ProjectDocumentPage
        key={documentId}
        projectId={projectId}
        document={document.data}
        subPageCount={subPageCount}
        focusTitle={focusTitle}
        onBack={onBack}
        refresh={() => document.refetch({ throwOnError: true })}
      />
    );
  return (
    <DocumentWindow
      title={t("tasks:projectHome.documents.label")}
      onClose={onBack}
    >
      <WorkspaceQueryState
        error={document.isError}
        onRetry={() => void document.refetch()}
      />
    </DocumentWindow>
  );
}
