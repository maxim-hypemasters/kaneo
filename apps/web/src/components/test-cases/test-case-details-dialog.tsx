import { DocumentDraftGuardProvider } from "@/components/editor/document-draft-guard";
import { TestCaseDetailsDialogView } from "./test-case-details-dialog-view";

export function TestCaseDetailsDialog(props: {
  projectId: string;
  workspaceId: string;
}) {
  return (
    <DocumentDraftGuardProvider>
      <TestCaseDetailsDialogView {...props} />
    </DocumentDraftGuardProvider>
  );
}
