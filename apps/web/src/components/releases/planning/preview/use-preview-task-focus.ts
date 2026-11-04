import { useLayoutEffect, useRef } from "react";
import type { GanttScrollAlign } from "@/components/gantt/use-gantt-range";
import type { PreviewWork } from "./preview-model";

export type PreviewTaskFocusRequest = { taskId: string; requestId: number };

export function usePreviewTaskFocus({
  request,
  tasks,
  element,
  ready,
  scrollToDate,
}: {
  request?: PreviewTaskFocusRequest;
  tasks: readonly PreviewWork[];
  element: HTMLElement | null;
  ready: boolean;
  scrollToDate: (
    date: Date,
    align: GanttScrollAlign,
    behavior: ScrollBehavior,
  ) => void;
}) {
  const handled = useRef<PreviewTaskFocusRequest | undefined>(undefined);
  useLayoutEffect(() => {
    if (!request || !element || !ready) return;
    if (
      handled.current?.taskId === request.taskId &&
      handled.current.requestId === request.requestId
    )
      return;
    const task = tasks.find(({ taskId }) => taskId === request.taskId);
    const row = Array.from(
      element.querySelectorAll<HTMLElement>("[data-gantt-row]"),
    ).find((candidate) => candidate.dataset.ganttRow === request.taskId);
    if (!task || !row) return;
    handled.current = request;
    scrollToDate(task.scheduleStart, "center", "auto");
    const viewport = element.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    const header = element.querySelector<HTMLElement>(
      "[data-gantt-preview-date-header]",
    );
    const top =
      viewport.top + (header?.getBoundingClientRect().height ?? 0) + 8;
    const bottom = viewport.top + element.clientHeight - 8;
    if (
      element.clientHeight > 0 &&
      (bounds.top < top || bounds.bottom > bottom)
    ) {
      // Change this viewport only; scrollIntoView would also move the dialog
      // and its independently scrolling conflict panel.
      element.scrollTo({
        top: Math.max(0, element.scrollTop + bounds.top - top),
        behavior: "auto",
      });
    }
  }, [request, tasks, element, ready, scrollToDate]);
}
