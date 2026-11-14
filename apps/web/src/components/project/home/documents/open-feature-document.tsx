import { useTranslation } from "react-i18next";
import { DocumentWindow } from "@/components/documents/document-window";
import { FeatureDocumentPage } from "@/components/task/features/workspace/feature-document-page";
import { WorkspaceQueryState } from "@/components/task/features/workspace/workspace-query-state";
import { useFeatureDocument } from "@/hooks/queries/feature/use-feature-workspace";

// A Feature document opened from the project's Documents tab edits exactly as
// it does on its Feature.
export function OpenFeatureDocument({
  projectId,
  featureId,
  documentId,
  onBack,
}: {
  projectId: string;
  featureId: string;
  documentId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const document = useFeatureDocument(projectId, featureId, documentId);
  if (document.data)
    return (
      <FeatureDocumentPage
        key={documentId}
        featureId={featureId}
        projectId={projectId}
        document={document.data}
        onBack={onBack}
        refresh={() => document.refetch({ throwOnError: true })}
      />
    );
  return (
    <DocumentWindow
      title={t("tasks:features.workspace.documentBody")}
      onClose={onBack}
    >
      <WorkspaceQueryState
        error={document.isError}
        onRetry={() => void document.refetch()}
      />
    </DocumentWindow>
  );
}
