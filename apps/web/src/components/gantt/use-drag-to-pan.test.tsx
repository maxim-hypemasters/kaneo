import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useDragToPan } from "./use-drag-to-pan";

// jsdom has no PointerEvent; this one carries pointerType like the real one.
class TestPointerEvent extends MouseEvent {
  pointerType: string;
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
    this.pointerId = init.pointerId ?? 1;
  }
}

function Harness() {
  const onPointerDown = useDragToPan();
  return (
    <>
      <input aria-label="Timeline start date" />
      <div data-testid="scroller" onPointerDown={onPointerDown}>
        <div data-testid="empty">timeline</div>
        <button type="button">Bar</button>
      </div>
    </>
  );
}

function setup() {
  render(<Harness />);
  const scroller = screen.getByTestId("scroller");
  // jsdom doesn't scroll; keep plain values so the hook's writes are visible.
  let left = 1000;
  let top = 200;
  Object.defineProperties(scroller, {
    scrollLeft: { get: () => left, set: (value) => (left = value) },
    scrollTop: { get: () => top, set: (value) => (top = value) },
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  return scroller;
}

function press(target: Element, pointerType = "mouse") {
  fireEvent.pointerDown(target, {
    button: 0,
    clientX: 500,
    clientY: 300,
    pointerType,
  });
}

function move(x: number, y: number, buttons = 1) {
  fireEvent.pointerMove(window, { clientX: x, clientY: y, buttons });
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useDragToPan", () => {
  it("scrolls opposite to the drag on empty timeline space", () => {
    const scroller = setup();

    press(screen.getByTestId("empty"));
    move(440, 280);
    expect(scroller.scrollLeft).toBe(1060);
    expect(scroller.scrollTop).toBe(220);
    expect(scroller).toHaveAttribute("data-panning");

    move(400, 280);
    expect(scroller.scrollLeft).toBe(1100);

    fireEvent.pointerUp(window, { clientX: 400, clientY: 280 });
    expect(scroller).not.toHaveAttribute("data-panning");
    move(300, 280);
    expect(scroller.scrollLeft).toBe(1100);
  });

  it("leaves tiny movements as clicks", () => {
    const scroller = setup();

    press(screen.getByTestId("empty"));
    move(501, 301);

    expect(scroller.scrollLeft).toBe(1000);
    expect(scroller).not.toHaveAttribute("data-panning");
  });

  it("doesn't pan from buttons, so bars and controls keep their own drags", () => {
    const scroller = setup();

    press(screen.getByRole("button", { name: "Bar" }));
    move(400, 300);

    expect(scroller.scrollLeft).toBe(1000);
  });

  it("leaves touch to the browser's native scrolling", () => {
    const scroller = setup();

    press(screen.getByTestId("empty"), "touch");
    move(400, 300);

    expect(scroller.scrollLeft).toBe(1000);
  });

  it("stops when the button was released somewhere it couldn't see", () => {
    const scroller = setup();

    press(screen.getByTestId("empty"));
    move(450, 300);
    expect(scroller.scrollLeft).toBe(1050);

    move(300, 300, 0);
    expect(scroller.scrollLeft).toBe(1050);
    expect(scroller).not.toHaveAttribute("data-panning");
  });

  it("takes focus away from a focused control, like a click would", () => {
    setup();
    const field = screen.getByLabelText("Timeline start date");
    field.focus();
    expect(field).toHaveFocus();

    press(screen.getByTestId("empty"));

    expect(field).not.toHaveFocus();
  });

  it("ignores other pointers while panning", () => {
    const scroller = setup();

    press(screen.getByTestId("empty"));
    fireEvent.pointerMove(window, {
      clientX: 300,
      clientY: 300,
      buttons: 1,
      pointerId: 2,
    });
    expect(scroller.scrollLeft).toBe(1000);
    fireEvent.pointerUp(window, { clientX: 300, clientY: 300, pointerId: 2 });

    move(450, 300);
    expect(scroller.scrollLeft).toBe(1050);
  });
});
