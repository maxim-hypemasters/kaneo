import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { AlertDialogCreateHandle } from "@/components/ui/alert-dialog";
import { useDocumentDraftNavigation } from "@/components/editor/document-draft-guard";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { TaskSheetHeader } from "./header/task-sheet-header";
import { MilestoneSelectionProvider } from "./milestones/milestone-selection-context";
import { PropertiesRail } from "./properties/properties-rail";
import { PropertyChips } from "./properties/property-chips";
import TaskDeleteDialog from "./task-delete-dialog";
import TaskDetailsContent from "./task-details-content";
import { TaskShortcuts } from "./task-shortcuts";
import { getTaskReleaseOrigin, taskReleaseSearch } from "./task-release-origin";
import { TaskReleaseOriginProvider } from "./task-release-origin-context";

export type TaskDetailsSheetProps = {
  taskId: string | undefined;
  projectId: string;
  workspaceId: string;
  originReleaseId?: string;
  onClose: () => void;
  finalFocus?: ComponentProps<typeof SheetContent>["finalFocus"];
};

export function TaskDetailsSheetView({
  taskId,
  projectId,
  workspaceId,
  originReleaseId,
  onClose,
  finalFocus,
}: TaskDetailsSheetProps) {
  const navigate = useNavigate();
  const requestLeave = useDocumentDraftNavigation();
  const [sheetOpen, setSheetOpen] = useState(Boolean(taskId));
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(
    taskId,
  );
  const [deleteHandle] = useState(() => AlertDialogCreateHandle());
  const shownTaskId = useDeferredValue(currentTaskId);
  const { data: shownTask } = useGetTask(shownTaskId ?? "");
  const origin = getTaskReleaseOrigin(
    projectId,
    shownTask?.projectId,
    originReleaseId,
  );

  const lastTaskIdRef = useRef(taskId);
  const requestedTaskIdRef = useRef(taskId);

  useEffect(() => {
    if (taskId === requestedTaskIdRef.current) return;
    requestedTaskIdRef.current = taskId;
    void requestLeave(() => {
      if (requestedTaskIdRef.current !== taskId) return;
      setSheetOpen(Boolean(taskId));
      if (taskId) {
        lastTaskIdRef.current = taskId;
        setCurrentTaskId(taskId);
      }
    });
  }, [taskId, requestLeave]);

  useEffect(() => {
    if (sheetOpen) return;
    const timer = setTimeout(() => setCurrentTaskId(undefined), 300);
    return () => clearTimeout(timer);
  }, [sheetOpen]);

  const handleClose = useCallback(() => {
    void requestLeave(() => {
      setSheetOpen(false);
      onClose();
    });
  }, [onClose, requestLeave]);

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleOpenFullPage = useCallback(() => {
    if (!shownTaskId) return;
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: {
        workspaceId,
        projectId,
        taskId: shownTaskId,
      },
      search: taskReleaseSearch(origin, projectId),
    });
  }, [navigate, workspaceId, projectId, shownTaskId, origin]);

  return (
    <TaskReleaseOriginProvider origin={origin}>
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent
          side="right"
          data-task-view
          data-shortcuts="allow"
          className="w-full max-w-full gap-0 p-0 sm:max-w-lg md:max-w-2xl lg:max-w-4xl [&>button]:hidden"
          // Focusing the first control would pop the "open in full page"
          // tooltip over the actions every time the sheet opens on touch.
          initialFocus={closeButtonRef}
          finalFocus={
            finalFocus ??
            (() =>
              document.querySelector<HTMLElement>(
                `[data-task-id="${lastTaskIdRef.current}"]`,
              ) ?? true)
          }
        >
          {shownTaskId && (
            <TaskSheetHeader
              taskId={shownTaskId}
              projectId={projectId}
              workspaceId={workspaceId}
              deleteHandle={deleteHandle}
              onOpenFullPage={handleOpenFullPage}
              onClose={handleClose}
              closeButtonRef={closeButtonRef}
            />
          )}

          {shownTaskId && (
            <TaskShortcuts
              taskId={shownTaskId}
              projectId={projectId}
              workspaceId={workspaceId}
              enabled={sheetOpen}
            />
          )}
          {shownTaskId && (
            <TaskDeleteDialog
              handle={deleteHandle}
              taskId={shownTaskId}
              onDeleted={handleClose}
              shortcutEnabled={sheetOpen}
            />
          )}
          {shownTaskId && (
            <MilestoneSelectionProvider key={shownTaskId}>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
                <div className="min-w-0 flex-1 lg:overflow-y-auto">
                  <TaskDetailsContent
                    taskId={shownTaskId}
                    projectId={projectId}
                    workspaceId={workspaceId}
                    className="px-5 pt-5 pb-10 lg:px-9 lg:pt-7"
                    properties={
                      <PropertyChips
                        taskId={shownTaskId}
                        projectId={projectId}
                        workspaceId={workspaceId}
                        className="pb-5 lg:hidden"
                      />
                    }
                  />
                </div>
                <PropertiesRail
                  taskId={shownTaskId}
                  projectId={projectId}
                  workspaceId={workspaceId}
                  className="hidden w-73 shrink-0 overflow-y-auto border-border border-l lg:flex"
                />
              </div>
            </MilestoneSelectionProvider>
          )}
        </SheetContent>
      </Sheet>
    </TaskReleaseOriginProvider>
  );
}
