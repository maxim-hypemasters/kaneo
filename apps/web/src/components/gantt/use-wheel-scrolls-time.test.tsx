import { cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { useWheelScrollsTime } from "./use-wheel-scrolls-time";

function Harness() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useWheelScrollsTime(element);
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

function setup() {
  render(<Harness />);
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

afterEach(() => {
  cleanup();
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

  it("leaves sideways gestures, Shift and zoom to the browser", () => {
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
});
