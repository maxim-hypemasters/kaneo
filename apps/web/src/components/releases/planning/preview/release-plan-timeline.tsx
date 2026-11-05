import { isWeekend, startOfToday } from "date-fns";
import { Calendar } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GanttDependencyLines } from "@/components/gantt/gantt-dependency-lines";
import { GanttLaneSummaryLine } from "@/components/gantt/gantt-lane-summary-line";
import { GanttPeriodControls } from "@/components/gantt/gantt-period-controls";
import { GanttReleaseMarkers } from "@/components/gantt/gantt-release-markers";
import { releaseMarkerDays } from "@/components/gantt/release-marker-days";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Release } from "@/types/release";
import type { ReleasePlanPreview } from "@/types/release-plan";
import { previewModel } from "./preview-model";
import { PreviewDateHeader } from "./preview-date-header";
import { PreviewTaskRow } from "./preview-task-row";
import { usePreviewTimeline } from "./use-preview-timeline";
import type { PreviewTaskFocusRequest } from "./use-preview-task-focus";

export function ReleasePlanTimeline({
  projectId,
  preview,
  release,
  focusRequest,
}: {
  projectId: string;
  preview: ReleasePlanPreview;
  release: Release;
  focusRequest?: PreviewTaskFocusRequest;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const [releaseMetadata] = useState(release);
  const chartRelease = useMemo(
    () => ({ ...releaseMetadata, ...preview.releaseDates }),
    [releaseMetadata, preview.releaseDates],
  );
  const model = useMemo(
    () => previewModel(preview, projectId),
    [preview, projectId],
  );
  const range = usePreviewTimeline(
    projectId,
    model.scheduled,
    chartRelease,
    focusRequest,
  );
  const { timeline, dayColumnWidthRem } = range;
  if (!timeline) return null;
  const markers = releaseMarkerDays([chartRelease], timeline);
  const emptyMessage = !preview.tasks.length
    ? t("tasks:releases.planning.empty")
    : !model.scheduled.length && model.unscheduled.length
      ? t("tasks:releases.planning.previewChart.noScheduled")
      : null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        role="group"
        aria-label={t("tasks:releases.planning.previewChart.navigation")}
        className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3"
      >
        <GanttPeriodControls
          timeline={timeline}
          viewport={range.viewport}
          onGoToDate={range.scrollToDate}
          onPage={range.scrollByPage}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => range.scrollToDate(startOfToday(), "center")}
        >
          <Calendar aria-hidden="true" className="size-4" />
          {t("tasks:gantt.jumpToToday")}
        </Button>
      </div>
      <p id={hintId} className="sr-only">
        {t("tasks:releases.planning.previewChart.scrollHint")}
      </p>
      <div
        ref={range.setScrollElement}
        role="region"
        aria-label={t("tasks:releases.planning.previewChart.timeline")}
        aria-describedby={hintId}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A scrollable chart region must be focusable for keyboard scrolling in every browser.
        tabIndex={0}
        data-gantt-scroll-container=""
        data-testid="release-plan-timeline-scroll"
        onPointerDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("[data-gantt-rail]")
          )
            return;
          range.pan(event);
        }}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [-webkit-overflow-scrolling:touch]"
      >
        <div
          className="touch-pan-x touch-pan-y"
          style={{ width: `${timeline.timelineMinWidthRem}rem` }}
        >
          <PreviewDateHeader
            timeline={timeline}
            markerDays={markers}
            dayWidthRem={dayColumnWidthRem}
          />
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid"
              style={{
                gridTemplateColumns: timeline.gridTemplateColumns,
              }}
            >
              {timeline.days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "border-r border-border/60",
                    isWeekend(day) && "bg-muted/25",
                  )}
                />
              ))}
            </div>
            <GanttReleaseMarkers days={markers} timeline={timeline} left="0" />
            <div data-gantt-lanes="" className="relative">
              <GanttDependencyLines
                dependencies={model.dependencies}
                spans={model.spans}
                timeline={timeline}
                dayColumnWidthRem={dayColumnWidthRem}
                railWidthRem={0}
                alignToDays
                layoutKey={model.lanes
                  .map((lane) =>
                    lane.tasks.map((task) => task.taskId).join(","),
                  )
                  .join(";")}
              />
              {model.lanes.map((lane) => (
                <section
                  key={lane.key}
                  aria-label={
                    lane.name ??
                    t(
                      lane.assigneeId
                        ? "common:people.unknown"
                        : "tasks:releases.planning.unassigned",
                    )
                  }
                >
                  <div className="relative min-h-10 border-b bg-muted/40">
                    <h3 className="sticky left-0 z-[2] flex h-8 w-fit max-w-64 items-center gap-2 bg-background px-2 text-xs font-medium sm:px-3">
                      <AssigneeAvatar
                        assigned={lane.assigneeId !== null}
                        name={lane.name}
                        image={null}
                        className="size-5"
                      />
                      <span
                        className="min-w-0 truncate"
                        title={lane.name ?? undefined}
                      >
                        {lane.name ??
                          t(
                            lane.assigneeId
                              ? "common:people.unknown"
                              : "tasks:releases.planning.unassigned",
                          )}
                      </span>
                      <span className="text-muted-foreground">
                        {lane.tasks.length}
                      </span>
                    </h3>
                    <GanttLaneSummaryLine
                      start={lane.start}
                      end={lane.end}
                      timeline={timeline}
                    />
                  </div>
                  {lane.tasks.map((task) => (
                    <PreviewTaskRow
                      key={task.taskId}
                      task={task}
                      timeline={timeline}
                      dayWidthRem={dayColumnWidthRem}
                      focused={focusRequest?.taskId === task.taskId}
                    />
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
        {emptyMessage && (
          <p
            data-gantt-rail=""
            className="sticky left-0 bg-background p-4 text-sm text-muted-foreground"
          >
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
