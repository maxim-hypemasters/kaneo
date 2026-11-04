import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { previewTask, releasePreview } from "./preview-fixtures";
import { previewModel } from "./preview-model";
import {
  usePreviewTaskFocus,
  type PreviewTaskFocusRequest,
} from "./use-preview-task-focus";

afterEach(() => document.body.replaceChildren());

function fixture(rowOffset = 600) {
  const element = document.createElement("div");
  const header = document.createElement("div");
  header.dataset.ganttPreviewDateHeader = "";
  const row = document.createElement("div");
  row.dataset.ganttRow = "late";
  element.append(header, row);
  document.body.append(element);
  element.scrollTo = vi.fn((options?: ScrollToOptions | number, y?: number) => {
    if (typeof options === "number") {
      element.scrollLeft = options;
      element.scrollTop = y ?? element.scrollTop;
      return;
    }
    element.scrollLeft = options?.left ?? element.scrollLeft;
    element.scrollTop = options?.top ?? element.scrollTop;
  });
  Object.defineProperty(element, "clientHeight", { value: 400 });
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(
    () => ({ top: 120, bottom: 520, height: 400 }) as DOMRect,
  );
  vi.spyOn(header, "getBoundingClientRect").mockImplementation(
    () => ({ height: 80 }) as DOMRect,
  );
  vi.spyOn(row, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        top: 120 + rowOffset - element.scrollTop,
        bottom: 120 + rowOffset + 56 - element.scrollTop,
        height: 56,
      }) as DOMRect,
  );
  const task = previewTask("late", {
    start: "2032-04-12T09:00:00Z",
    end: "2032-04-12T13:00:00Z",
    segments: [{ start: "2032-04-12T09:00:00Z", end: "2032-04-12T13:00:00Z" }],
  });
  return {
    element,
    tasks: previewModel(releasePreview([task]), "project").scheduled,
  };
}

describe("preview task focus", () => {
  it("centers the proposed start and reveals the row below sticky headers without changing keyboard focus", () => {
    const { element, tasks } = fixture();
    const scrollToDate = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    renderHook(() =>
      usePreviewTaskFocus({
        request: { taskId: "late", requestId: 1 },
        tasks,
        element,
        ready: true,
        scrollToDate,
      }),
    );
    expect(scrollToDate).toHaveBeenCalledExactlyOnceWith(
      new Date("2032-04-12T09:00:00Z"),
      "center",
      "auto",
    );
    expect(element.scrollTop).toBe(512);
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("handles repeated clicks while keeping panning stable on unrelated renders", () => {
    const { element, tasks } = fixture();
    const scrollToDate = vi.fn();
    const hook = renderHook(
      ({ request }: { request: PreviewTaskFocusRequest }) =>
        usePreviewTaskFocus({
          request,
          tasks,
          element,
          ready: true,
          scrollToDate,
        }),
      { initialProps: { request: { taskId: "late", requestId: 1 } } },
    );
    element.scrollTop = 0;
    hook.rerender({ request: { taskId: "late", requestId: 1 } });
    expect(element.scrollTop).toBe(0);
    expect(scrollToDate).toHaveBeenCalledTimes(1);
    hook.rerender({ request: { taskId: "late", requestId: 2 } });
    expect(element.scrollTop).toBe(512);
    expect(scrollToDate).toHaveBeenCalledTimes(2);
  });

  it("reveals rows above the viewport but leaves already visible rows in place", () => {
    const { element, tasks } = fixture();
    element.scrollTop = 700;
    const scrollToDate = vi.fn();
    const hook = renderHook(
      ({ requestId }) =>
        usePreviewTaskFocus({
          request: { taskId: "late", requestId },
          tasks,
          element,
          ready: true,
          scrollToDate,
        }),
      { initialProps: { requestId: 1 } },
    );
    expect(element.scrollTop).toBe(512);
    element.scrollTop = 500;
    hook.rerender({ requestId: 2 });
    expect(element.scrollTop).toBe(500);
  });

  it("waits for the timeline and ignores tasks absent from the proposal", () => {
    const { element, tasks } = fixture();
    const scrollToDate = vi.fn();
    const hook = renderHook(
      ({ ready, taskId }) =>
        usePreviewTaskFocus({
          request: { taskId, requestId: 1 },
          tasks,
          element,
          ready,
          scrollToDate,
        }),
      { initialProps: { ready: false, taskId: "late" } },
    );
    expect(scrollToDate).not.toHaveBeenCalled();
    hook.rerender({ ready: true, taskId: "deleted" });
    expect(scrollToDate).not.toHaveBeenCalled();
    hook.rerender({ ready: true, taskId: "late" });
    expect(scrollToDate).toHaveBeenCalledOnce();
  });
});
