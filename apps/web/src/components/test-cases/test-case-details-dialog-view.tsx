import { useLocation } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentDraftNavigation } from "@/components/editor/document-draft-guard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTestCase } from "@/hooks/queries/test-case/use-test-case";
import { useTestCaseDetailsStore } from "@/store/test-case-details";
import { TestCaseDeleteButton } from "./test-case-delete-button";
import { TestCaseDetails } from "./test-case-details";
import { TestCaseQueryState } from "./test-case-query-state";

// An open test case takes the whole screen; closing it returns to the page
// underneath.
export function TestCaseDetailsDialogView({
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
  // The closing popup keeps the test case it showed, deleted or not.
  const [shown, setShown] = useState(query.data);
  if (id && query.data !== shown) setShown(query.data);
  const requestLeave = useDocumentDraftNavigation();
  const pathname = useLocation({ select: (location) => location.pathname });
  const closeButton = useRef<HTMLButtonElement>(null);
  // The popup covers the page, so it closes when the page behind it changes,
  // such as after following the link to its bug.
  useEffect(
    () => () => {
      if (useTestCaseDetailsStore.getState().projectId === projectId) close();
    },
    [projectId, pathname, close],
  );
  // An unsaved text asks to be kept or discarded first.
  const leave = () => void requestLeave(close);
  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(open) => {
        if (!open) leave();
      }}
    >
      <DialogPopup
        fullscreen
        showCloseButton={false}
        // Focusing the first field would open the title for typing.
        initialFocus={closeButton}
        className="bg-background"
      >
        <DialogHeader className="flex-row items-center gap-1 border-b px-3 py-2 sm:px-5">
          <DialogTitle className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-sm">
            {t("tasks:testCases.singular")}
          </DialogTitle>
          {shown && (
            <TestCaseDeleteButton
              projectId={projectId}
              testCaseId={shown.id}
              onDeleted={close}
            />
          )}
          <Button
            ref={closeButton}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common:actions.close")}
            onClick={leave}
          >
            <X />
          </Button>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {shown ? (
            <TestCaseDetails
              key={shown.id}
              testCase={shown}
              projectId={projectId}
              workspaceId={workspaceId}
            />
          ) : (
            <div className="p-6">
              <TestCaseQueryState
                isPending={query.isPending}
                isError={query.isError}
                onRetry={() => void query.refetch()}
              />
            </div>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
