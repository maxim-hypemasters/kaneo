import { DocumentDraftGuardProvider } from "@/components/editor/document-draft-guard";
import {
  TaskDetailsSheetView,
  type TaskDetailsSheetProps,
} from "./task-details-sheet-view";

export default function TaskDetailsSheet(props: TaskDetailsSheetProps) {
  return (
    <DocumentDraftGuardProvider>
      <TaskDetailsSheetView {...props} />
    </DocumentDraftGuardProvider>
  );
}
