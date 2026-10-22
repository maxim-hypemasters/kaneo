import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useWheelScrollsTime } from "./use-wheel-scrolls-time";

type Options = NonNullable<Parameters<typeof useWheelScrollsTime>[1]>;

function Harness({ options }: { options?: Options }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useWheelScrollsTime(element, options);
  return (
    <div ref={setElement} data-testid="scroller">
      <div data-gantt-rail="">
        <span>Task list</span>
      </div>
      <div>
        <span>Timeline</span>
      </div>
    </div>
  );
}

function setup(options?: Options) {
  render(<Harness options={options} />);
  const scroller = screen.getByTestId("scroller");
  let left = 1000;
  Object.defineProperties(scroller, {
    scrollLeft: { get: () => left, set: (value: number) => (left = value) },
    clientWidth: { value: 800 },
  });
  return scroller;
}

function wheel(target: Element, init: WheelEventInit) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function pointer(
  type: "pointerdown" | "pointerup" | "pointercancel",
  id: number,
) {
  const event = new Event(type);
  Object.defineProperty(event, "pointerId", { value: id });
  window.dispatchEvent(event);
}

let nextFrame = 0;
let frames: Map<number, FrameRequestCallback>;

function flushFrame() {
  act(() => {
    const queued = [...frames.values()];
    frames.clear();
    for (const callback of queued) callback(0);
  });
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useWheelScrollsTime", () => {
  it("turns a vertical wheel over the timeline into scrolling through time", () => {
    const scroller = setup();

    const event = wheel(screen.getByText("Timeline"), { deltaY: 120 });

    expect(event.defaultPrevented).toBe(true);
    expect(scroller.scrollLeft).toBe(1120);
    wheel(screen.getByText("Timeline"), { deltaY: -200 });
    expect(scroller.scrollLeft).toBe(920);
  });

  it("scales wheels that report lines or pages", () => {
    const scroller = setup();

    wheel(screen.getByText("Timeline"), { deltaY: 3, deltaMode: 1 });
    expect(scroller.scrollLeft).toBe(1120);

    wheel(screen.getByText("Timeline"), { deltaY: -1, deltaMode: 2 });
    expect(scroller.scrollLeft).toBe(320);
  });

  it("keeps the wheel scrolling rows over the task list", () => {
    const scroller = setup();

    const event = wheel(screen.getByText("Task list"), { deltaY: 120 });

    expect(event.defaultPrevented).toBe(false);
    expect(scroller.scrollLeft).toBe(1000);
  });

  it("leaves sideways gestures, unconfigured Shift and browser zoom unchanged", () => {
    const scroller = setup();
    const timeline = screen.getByText("Timeline");

    for (const init of [
      { deltaX: 80, deltaY: 10 },
      { deltaY: 120, shiftKey: true },
      { deltaY: 120, ctrlKey: true },
      { deltaY: 120, metaKey: true },
    ]) {
      expect(wheel(timeline, init).defaultPrevented).toBe(false);
    }
    expect(scroller.scrollLeft).toBe(1000);
  });

  it("zooms with Shift in either direction, using the dominant wheel axis", () => {
    const onZoom = vi.fn();
    const scroller = setup({ onZoom });
    const timeline = screen.getByText("Timeline");

    expect(
      wheel(timeline, { shiftKey: true, deltaY: -120, clientX: 430 })
        .defaultPrevented,
    ).toBe(true);
    flushFrame();
    expect(onZoom).toHaveBeenLastCalledWith(-120, 430);

    wheel(timeline, { shiftKey: true, deltaY: 80, deltaX: 10, clientX: 510 });
    flushFrame();
    expect(onZoom).toHaveBeenLastCalledWith(80, 510);

    wheel(timeline, { shiftKey: true, deltaX: -50, clientX: 600 });
    flushFrame();
    expect(onZoom).toHaveBeenLastCalledWith(-50, 600);
    wheel(timeline, { shiftKey: true, deltaX: 60, deltaY: 1, clientX: 620 });
    flushFrame();
    expect(onZoom).toHaveBeenLastCalledWith(60, 620);
    expect(scroller.scrollLeft).toBe(1000);
  });

  it("normalizes Shift wheels that report lines or pages", () => {
    const onZoom = vi.fn();
    setup({ onZoom });
    const timeline = screen.getByText("Timeline");

    wheel(timeline, { shiftKey: true, deltaY: -3, deltaMode: 1, clientX: 400 });
    flushFrame();
    expect(onZoom).toHaveBeenLastCalledWith(-120, 400);
    wheel(timeline, { shiftKey: true, deltaX: 1, deltaMode: 2, clientX: 500 });
    flushFrame();
    expect(onZoom).toHaveBeenLastCalledWith(800, 500);
  });

  it("coalesces rapid zoom input per frame around the latest pointer position", () => {
    const onZoom = vi.fn();
    setup({ onZoom });
    const timeline = screen.getByText("Timeline");

    wheel(timeline, { shiftKey: true, deltaY: -10, clientX: 400 });
    wheel(timeline, { shiftKey: true, deltaY: -20, clientX: 420 });
    wheel(timeline, { shiftKey: true, deltaY: 5, clientX: 450 });
    expect(onZoom).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    flushFrame();
    expect(onZoom).toHaveBeenCalledExactlyOnceWith(-25, 450);
  });

  it("keeps Ctrl/Command zoom and task-rail scrolling native, including with Shift", () => {
    const onZoom = vi.fn();
    const scroller = setup({ onZoom });
    const timeline = screen.getByText("Timeline");

    for (const key of ["ctrlKey", "metaKey"]) {
      expect(
        wheel(timeline, { shiftKey: true, [key]: true, deltaY: -120 })
          .defaultPrevented,
      ).toBe(false);
    }
    expect(
      wheel(screen.getByText("Task list"), { shiftKey: true, deltaY: -120 })
        .defaultPrevented,
    ).toBe(false);
    flushFrame();
    expect(onZoom).not.toHaveBeenCalled();
    expect(scroller.scrollLeft).toBe(1000);
  });

  it("captures Shift scrolling even when the zoom callback is already at a limit", () => {
    const scroller = setup({ onZoom: () => {} });

    const event = wheel(screen.getByText("Timeline"), {
      shiftKey: true,
      deltaY: 120,
    });
    flushFrame();
    expect(event.defaultPrevented).toBe(true);
    expect(scroller.scrollLeft).toBe(1000);
  });

  it("blocks zoom during pointer gestures or timeline panning", () => {
    const onZoom = vi.fn();
    let blocked = false;
    const scroller = setup({ onZoom, isZoomBlocked: () => blocked });
    const timeline = screen.getByText("Timeline");
    const event = () => wheel(timeline, { shiftKey: true, deltaY: -120 });

    expect(
      wheel(timeline, { shiftKey: true, deltaY: -120, buttons: 1 })
        .defaultPrevented,
    ).toBe(true);
    scroller.dataset.panning = "";
    expect(event().defaultPrevented).toBe(true);
    delete scroller.dataset.panning;
    blocked = true;
    expect(event().defaultPrevented).toBe(true);
    flushFrame();
    expect(onZoom).not.toHaveBeenCalled();

    blocked = false;
    event();
    blocked = true;
    flushFrame();
    expect(onZoom).not.toHaveBeenCalled();
  });

  it.each(["pointerup", "pointercancel"] as const)(
    "waits for every held pointer to end through %s, even when wheel buttons are zero",
    (end) => {
      const onZoom = vi.fn();
      setup({ onZoom });
      const timeline = screen.getByText("Timeline");
      const zoom = () =>
        wheel(timeline, { shiftKey: true, deltaY: -120, buttons: 0 });

      pointer("pointerdown", 11);
      pointer("pointerdown", 12);
      pointer(end, 13);
      expect(zoom().defaultPrevented).toBe(true);
      flushFrame();
      expect(onZoom).not.toHaveBeenCalled();
      pointer(end, 11);
      zoom();
      flushFrame();
      expect(onZoom).not.toHaveBeenCalled();
      pointer(end, 12);
      zoom();
      flushFrame();
      expect(onZoom).toHaveBeenCalledOnce();
    },
  );

  it("clears held pointers on blur so an interrupted drag does not block future zoom", () => {
    const onZoom = vi.fn();
    setup({ onZoom });
    const timeline = screen.getByText("Timeline");
    pointer("pointerdown", 11);
    pointer("pointerdown", 12);
    window.dispatchEvent(new Event("blur"));

    wheel(timeline, { shiftKey: true, deltaY: -120, buttons: 0 });
    flushFrame();
    expect(onZoom).toHaveBeenCalledOnce();
  });

  it.each([
    "plain wheel",
    "browser zoom",
    "rail",
    "Shift release",
    "pointer",
    "blur",
  ])("cancels queued zoom on %s", (interrupt) => {
    const onZoom = vi.fn();
    setup({ onZoom });
    const timeline = screen.getByText("Timeline");
    wheel(timeline, { shiftKey: true, deltaY: -120 });

    if (interrupt === "plain wheel") wheel(timeline, { deltaY: 40 });
    else if (interrupt === "browser zoom")
      wheel(timeline, { shiftKey: true, ctrlKey: true, deltaY: -120 });
    else if (interrupt === "rail")
      wheel(screen.getByText("Task list"), { shiftKey: true, deltaY: -120 });
    else if (interrupt === "Shift release")
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    else
      window.dispatchEvent(
        new Event(interrupt === "pointer" ? "pointerdown" : "blur"),
      );

    flushFrame();
    expect(onZoom).not.toHaveBeenCalled();
  });

  it("uses the latest callback without discarding queued input on rerender", () => {
    const element = document.createElement("div");
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onZoom }) => useWheelScrollsTime(element, { onZoom }),
      { initialProps: { onZoom: first } },
    );
    wheel(element, { shiftKey: true, deltaY: -120, clientX: 400 });
    rerender({ onZoom: second });
    flushFrame();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(-120, 400);
  });

  it("cancels queued work and removes listeners when the element changes or unmounts", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const onZoom = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ element }) => useWheelScrollsTime(element, { onZoom }),
      { initialProps: { element: first } },
    );
    wheel(first, { shiftKey: true, deltaY: -120 });
    rerender({ element: second });
    flushFrame();
    expect(onZoom).not.toHaveBeenCalled();
    expect(
      wheel(first, { shiftKey: true, deltaY: -120 }).defaultPrevented,
    ).toBe(false);
    expect(
      wheel(second, { shiftKey: true, deltaY: -120 }).defaultPrevented,
    ).toBe(true);
    unmount();
    flushFrame();
    expect(onZoom).not.toHaveBeenCalled();
    expect(
      wheel(second, { shiftKey: true, deltaY: -120 }).defaultPrevented,
    ).toBe(false);
  });
});
