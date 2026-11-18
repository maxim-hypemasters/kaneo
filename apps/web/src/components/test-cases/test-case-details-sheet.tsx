import { DocumentDraftGuardProvider } from "@/components/editor/document-draft-guard";
import { TestCaseDetailsSheetView } from "./test-case-details-sheet-view";

export function TestCaseDetailsSheet(props: {
  projectId: string;
  workspaceId: string;
}) {
  return (
    <DocumentDraftGuardProvider>
      <TestCaseDetailsSheetView {...props} />
    </DocumentDraftGuardProvider>
  );
}
