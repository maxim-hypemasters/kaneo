import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTestCase } from "@/hooks/queries/test-case/use-test-case";
import { useTestCaseDetailsStore } from "@/store/test-case-details";
import { TestCaseDetails } from "./test-case-details";
import { TestCaseQueryState } from "./test-case-query-state";

export function TestCaseDetailsSheet({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const {
    testCaseId,
    projectId: openedProject,
    close,
  } = useTestCaseDetailsStore();
  const id = openedProject === projectId ? testCaseId : null;
  const query = useTestCase(projectId, id);
  useEffect(
    () => () => {
      if (useTestCaseDetailsStore.getState().projectId === projectId) close();
    },
    [projectId, close],
  );
  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetPopup className="w-full max-w-2xl">
        <SheetHeader>
          <SheetTitle className="break-words pr-7">
            {query.data?.title ?? t("tasks:testCases.singular")}
          </SheetTitle>
        </SheetHeader>
        <SheetPanel>
          {query.data ? (
            <TestCaseDetails
              key={query.data.id}
              testCase={query.data}
              projectId={projectId}
              workspaceId={workspaceId}
              onDeleted={close}
            />
          ) : (
            <TestCaseQueryState
              isPending={query.isPending}
              isError={query.isError}
              onRetry={() => void query.refetch()}
            />
          )}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
