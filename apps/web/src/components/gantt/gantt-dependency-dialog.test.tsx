import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { parseISO } from "date-fns";
import {
  afterEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vite-plus/test";
import { GanttDependencyDialog } from "./gantt-dependency-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: { count?: number; from?: string; to?: string },
    ) =>
      options?.from !== undefined
        ? `${key}:${options.from}>${options.to}`
        : options?.count === undefined
          ? key
          : `${key}:${options.count}`,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const moves = [
  {
    taskId: "b",
    title: "Build",
    from: { start: parseISO("2026-03-05"), end: parseISO("2026-03-08") },
    to: { start: parseISO("2026-03-07"), end: parseISO("2026-03-10") },
  },
  {
    taskId: "c",
    title: "Check",
    from: { start: parseISO("2026-03-08"), end: parseISO("2026-03-10") },
    to: { start: parseISO("2026-03-10"), end: parseISO("2026-03-12") },
  },
];

const handlers = {
  onMoveRelated: vi.fn(),
  onMoveOnly: vi.fn(),
  onCancel: vi.fn(),
};

function setup(list = moves, cycle = false) {
  const view = render(
    <GanttDependencyDialog
      open
      brokenCount={1}
      cycle={cycle}
      moves={list}
      {...handlers}
    />,
  );
  return { ...handlers, view };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GanttDependencyDialog", () => {
  it("lists where each related task would move", () => {
    setup();

    expect(
      screen.getByText("tasks:gantt.dependencies.title:1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Mar 5 – Mar 8, 2026")).toBeInTheDocument();
    expect(screen.getByText("Mar 7 – Mar 10, 2026")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
    // The struck-through and new dates read the same to a screen reader, so
    // it gets them spelled out instead.
    expect(screen.getByText("Mar 5 – Mar 8, 2026")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.getByText(
        "tasks:gantt.dependencies.moveDates:Mar 5 – Mar 8, 2026>Mar 7 – Mar 10, 2026",
      ),
    ).toHaveClass("sr-only");
  });

  it("starts on Cancel and lets a long list scroll by keyboard", async () => {
    setup();

    expect(
      screen.getByRole("region", {
        name: "tasks:gantt.dependencies.movesLabel",
      }),
    ).toHaveAttribute("tabindex", "0");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "common:actions.cancel" }),
      ).toHaveFocus(),
    );
  });

  it("only offers keeping or cancelling the change for a loop", () => {
    setup([], true);

    expect(
      screen.getByText("tasks:gantt.dependencies.cycleDescription"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /tasks:gantt.dependencies.moveRelated/,
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "tasks:gantt.dependencies.moveOnly" }),
    ).toBeInTheDocument();
  });

  it("keeps showing what it asked while it closes", () => {
    // An exit animation that never finishes keeps the closing dialog
    // mounted (jsdom has no animations, so it would unmount at once).
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value: () => [{ finished: new Promise(() => {}) }],
    });
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, "getAnimations");
    });
    const { view } = setup();

    view.rerender(
      <GanttDependencyDialog
        open={false}
        brokenCount={0}
        cycle={false}
        moves={[]}
        {...handlers}
      />,
    );

    expect(screen.queryByText("tasks:gantt.dependencies.title:0")).toBeNull();
    expect(screen.queryByText("Build")).not.toBeNull();
  });

  it("offers moving the related tasks, only this one, or cancelling", () => {
    const handlers = setup();

    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:gantt.dependencies.moveRelated:2",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:gantt.dependencies.moveOnly" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );

    expect(handlers.onMoveRelated).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveOnly).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", () => {
    const handlers = setup();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(handlers.onCancel).toHaveBeenCalled();
  });
});
