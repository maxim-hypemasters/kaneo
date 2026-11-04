import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import type { Release } from "@/types/release";
import type { ReleasePlanPreview } from "@/types/release-plan";
import { ReleasePlanTimeline } from "./preview/release-plan-timeline";
import { ReleasePlanResolution } from "./resolution/release-plan-resolution";
import type { useReleasePlan } from "./use-release-plan";

export function ReleasePlanPreviewContent({
  open,
  projectId,
  workspaceId,
  release,
  preview,
  planner,
  canPlan,
}: {
  open: boolean;
  projectId: string;
  workspaceId: string;
  release: Release;
  preview: ReleasePlanPreview;
  planner: ReturnType<typeof useReleasePlan>;
  canPlan: boolean;
}) {
  const { t } = useTranslation();
  const releases = useGetReleases(projectId, { enabled: open });
  const pending = planner.calculate.isPending || planner.apply.isPending;
  const contentRef = useRef<HTMLDivElement>(null);
  const taskReturnFocus = useRef<HTMLElement | null>(null);
  const [taskDetails, setTaskDetails] = useState<{ taskId?: string } | null>(
    null,
  );
  const [focusRequest, setFocusRequest] = useState<{
    taskId: string;
    requestId: number;
  }>();
  return (
    <div
      ref={contentRef}
      data-slot="dialog-panel"
      data-testid="release-plan-preview-content"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row"
    >
      <aside
        aria-label={t("tasks:gantt.taskHeader")}
        data-testid="release-plan-resolution-panel"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The independently scrolling conflict panel needs keyboard scrolling access.
        tabIndex={0}
        className="max-h-[30dvh] min-h-0 shrink-0 overflow-y-auto overscroll-contain border-b outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:max-h-none md:w-88 md:border-r md:border-b-0"
      >
        {releases.isError && (
          <Alert variant="error" className="m-4">
            <AlertTitle>
              {t("tasks:releases.planning.resolution.releasesError")}
            </AlertTitle>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() => void releases.refetch()}
            >
              {t("common:error.tryAgain")}
            </Button>
          </Alert>
        )}
        {releases.isPending && !releases.data && (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            {t("tasks:scheduling.loading")}
          </p>
        )}
        <ReleasePlanResolution
          preview={preview}
          release={release}
          releases={releases.data ?? []}
          tasks={planner.resolutionTasks}
          currentTasks={planner.query.data?.tasks}
          changes={planner.changes}
          pending={
            pending ||
            planner.inputSaving ||
            releases.isPending ||
            releases.isError
          }
          canPlan={canPlan && !planner.applied}
          applied={planner.applied}
          onChange={planner.updateChanges}
          onFocusTask={(taskId) =>
            setFocusRequest((previous) => ({
              taskId,
              requestId: (previous?.requestId ?? 0) + 1,
            }))
          }
          onOpenTask={(taskId) => {
            taskReturnFocus.current =
              Array.from(
                contentRef.current?.querySelectorAll<HTMLElement>(
                  "[data-task-id]",
                ) ?? [],
              ).find((element) => element.dataset.taskId === taskId) ?? null;
            setTaskDetails({ taskId });
          }}
          taskHref={(taskId) =>
            `/dashboard/workspace/${encodeURIComponent(workspaceId)}/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}?originReleaseId=${encodeURIComponent(release.id)}`
          }
        />
      </aside>
      <ReleasePlanTimeline
        key={preview.revision}
        projectId={projectId}
        release={release}
        preview={preview}
        focusRequest={focusRequest}
      />
      {taskDetails && (
        <TaskDetailsSheet
          taskId={taskDetails.taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          originReleaseId={release.id}
          onClose={() => setTaskDetails({})}
          finalFocus={() =>
            taskReturnFocus.current?.isConnected
              ? taskReturnFocus.current
              : (contentRef.current?.querySelector<HTMLElement>(
                  '[data-testid="release-plan-resolution-panel"]',
                ) ?? true)
          }
        />
      )}
    </div>
  );
}
