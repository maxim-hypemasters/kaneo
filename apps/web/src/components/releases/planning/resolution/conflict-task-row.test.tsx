import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { previewTask } from "../preview/preview-fixtures";
import { ConflictTaskRow } from "./conflict-task-row";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, values?: { title?: string }) =>
      values?.title ? `${key}: ${values.title}` : key,
  }),
}));
afterEach(cleanup);

const task = previewTask("39", { title: "Manual cases", identifier: "WWC-39" });
const focusLabel = "tasks:releases.planning.resolution.focusTask: Manual cases";

function setup(identifier: string | null = task.identifier) {
  const onFocusTask = vi.fn();
  const onOpenTask = vi.fn();
  const onMove = vi.fn();
  render(
    <ul>
      <ConflictTaskRow
        task={{ ...task, identifier }}
        timeZone="Europe/Belgrade"
        showFeature={false}
        onFocusTask={onFocusTask}
        onOpenTask={onOpenTask}
        taskHref="#task-39"
      >
        <button type="button" onClick={onMove}>
          Move to next release
        </button>
      </ConflictTaskRow>
    </ul>,
  );
  return { onFocusTask, onOpenTask, onMove };
}

describe("planning conflict task actions", () => {
  it("provides a separate keyboard-accessible timeline action over the card", () => {
    const { onFocusTask, onOpenTask, onMove } = setup();
    const focus = screen.getByRole("button", { name: focusLabel });
    expect(focus).toHaveAttribute("type", "button");
    expect(focus).toHaveClass("absolute", "inset-0");
    expect(within(focus).queryByRole("link")).not.toBeInTheDocument();
    expect(within(focus).queryByRole("button")).not.toBeInTheDocument();
    focus.focus();
    expect(focus).toHaveFocus();
    fireEvent.click(focus);
    fireEvent.click(focus);
    expect(onFocusTask).toHaveBeenNthCalledWith(1, "39");
    expect(onFocusTask).toHaveBeenNthCalledWith(2, "39");
    expect(onOpenTask).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("opens only task details from the identifier and retains a real link", () => {
    const { onFocusTask, onOpenTask, onMove } = setup();
    const link = screen.getByRole("link", { name: "WWC-39" });
    expect(link).toHaveAttribute("href", "#task-39");
    expect(link).toHaveAttribute("data-task-id", "39");
    expect(fireEvent.click(link)).toBe(false);
    expect(onOpenTask).toHaveBeenCalledWith("39");
    expect(onFocusTask).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"])(
    "preserves native link behavior for %s activation",
    (modifier) => {
      const { onFocusTask, onOpenTask } = setup();
      expect(
        fireEvent.click(screen.getByRole("link", { name: "WWC-39" }), {
          [modifier]: true,
        }),
      ).toBe(true);
      expect(onOpenTask).not.toHaveBeenCalled();
      expect(onFocusTask).not.toHaveBeenCalled();
    },
  );

  it("keeps the move action independent of opening and focusing the task", () => {
    const { onFocusTask, onOpenTask, onMove } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Move to next release" }),
    );
    expect(onMove).toHaveBeenCalledOnce();
    expect(onOpenTask).not.toHaveBeenCalled();
    expect(onFocusTask).not.toHaveBeenCalled();
  });

  it("keeps focusing available when the task has no identifier", () => {
    const { onFocusTask } = setup(null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: focusLabel }));
    expect(onFocusTask).toHaveBeenCalledWith("39");
  });

  it.each([true, false])(
    "renders a short local finish date with late=%s",
    (late) => {
      const end = "2026-11-30T23:30:00Z";
      render(
        <ul>
          <ConflictTaskRow
            task={{ ...task, end }}
            timeZone="Europe/Belgrade"
            showFeature={false}
            late={late}
          >
            <span>Read only</span>
          </ConflictTaskRow>
        </ul>,
      );
      expect(screen.getByText("WWC-39")).toBeVisible();
      const finish = screen.getByText("Dec 1", { exact: true });
      if (late) expect(finish).toHaveClass("text-warning");
      else expect(finish).not.toHaveClass("text-warning");
      expect(finish).toHaveAttribute("datetime", end);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    },
  );
});
