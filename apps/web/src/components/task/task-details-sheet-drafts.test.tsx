import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import TaskDetailsSheet from "./task-details-sheet";

const mocks = vi.hoisted(() => ({ saving: false }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useBlocker: vi.fn(),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: { projectId: "p" } }),
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialogCreateHandle: () => ({}),
}));
vi.mock("@/components/editor/document-draft-discard-dialog", () => ({
  DocumentDraftDiscardDialog: ({
    open,
    onKeepEditing,
    onDiscard,
  }: {
    open: boolean;
    onKeepEditing: () => void;
    onDiscard: () => void;
  }) =>
    open ? (
      <div role="alertdialog">
        <button type="button" onClick={onKeepEditing}>
          Keep editing
        </button>
        <button type="button" onClick={onDiscard}>
          Discard
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? (
      <div role="dialog" aria-label="Task">
        {children}
      </div>
    ) : null,
  SheetContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./header/task-sheet-header", () => ({
  TaskSheetHeader: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      Close task
    </button>
  ),
}));
vi.mock("./task-shortcuts", () => ({ TaskShortcuts: () => null }));
vi.mock("./task-delete-dialog", () => ({ default: () => null }));
vi.mock("./task-details-content", () => ({
  default: ({ taskId }: { taskId: string }) => (
    <Draft key={taskId} taskId={taskId} />
  ),
}));
vi.mock("./properties/properties-rail", () => ({ PropertiesRail: () => null }));
vi.mock("./properties/property-chips", () => ({ PropertyChips: () => null }));

function Draft({ taskId }: { taskId: string }) {
  const [value, setValue] = useState("");
  useDocumentDraftGuard({
    dirty: !!value,
    saving: mocks.saving,
    onDiscard: () => setValue(""),
  });
  return (
    <label>
      Draft {taskId}
      <input
        aria-label={`Draft ${taskId}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

beforeEach(() => {
  mocks.saving = false;
});
afterEach(cleanup);

describe("TaskDetailsSheet unsaved descriptions", () => {
  it("keeps the local sheet open until draft dismissal is confirmed", async () => {
    const onClose = vi.fn();
    render(
      <TaskDetailsSheet
        taskId="a"
        projectId="p"
        workspaceId="w"
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Draft a" }), {
      target: { value: "Unsaved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close task" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Draft a" })).toHaveValue(
      "Unsaved",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close task" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Discard" })),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("dialog", { name: "Task" }),
    ).not.toBeInTheDocument();
  });

  it("retains the current task on a cancelled local switch and accepts a later switch", async () => {
    const props = { projectId: "p", workspaceId: "w", onClose: vi.fn() };
    const view = render(<TaskDetailsSheet {...props} taskId="a" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Draft a" }), {
      target: { value: "Unsaved" },
    });
    view.rerender(<TaskDetailsSheet {...props} taskId="b" />);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("textbox", { name: "Draft a" })).toHaveValue(
      "Unsaved",
    );
    expect(
      screen.queryByRole("textbox", { name: "Draft b" }),
    ).not.toBeInTheDocument();
    view.rerender(<TaskDetailsSheet {...props} taskId="c" />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Discard" })),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Draft c" }),
      ).toBeInTheDocument(),
    );
  });

  it("blocks local closing while a description or upload is saving", async () => {
    mocks.saving = true;
    const onClose = vi.fn();
    render(
      <TaskDetailsSheet
        taskId="a"
        projectId="p"
        workspaceId="w"
        onClose={onClose}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Close task" })),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Task" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
