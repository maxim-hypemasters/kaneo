import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ReactNode } from "react";
import TaskDetailsSheet from "./task-details-sheet";
import { useTaskReleaseOrigin } from "./task-release-origin-context";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), projectId: "p" }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({ data: { projectId: mocks.projectId } }),
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialogCreateHandle: () => ({}),
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./header/task-sheet-header", () => ({
  TaskSheetHeader: ({ onOpenFullPage }: { onOpenFullPage: () => void }) => (
    <button type="button" onClick={onOpenFullPage}>
      Full page
    </button>
  ),
}));
vi.mock("./task-shortcuts", () => ({ TaskShortcuts: () => null }));
vi.mock("./task-delete-dialog", () => ({ default: () => null }));
vi.mock("./task-details-content", () => ({
  default: () => <ContextProbe name="inline" />,
}));
vi.mock("./properties/properties-rail", () => ({
  PropertiesRail: () => <ContextProbe name="rail" />,
}));
vi.mock("./properties/property-chips", () => ({ PropertyChips: () => null }));

function ContextProbe({ name }: { name: string }) {
  const origin = useTaskReleaseOrigin();
  return <output aria-label={name}>{origin?.releaseId ?? "none"}</output>;
}

beforeEach(() => {
  mocks.projectId = "p";
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("TaskDetailsSheet release context", () => {
  it("provides the originating release to desktop and mobile content and full-page navigation", () => {
    render(
      <TaskDetailsSheet
        taskId="feature"
        projectId="p"
        workspaceId="w"
        originReleaseId="r"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("inline")).toHaveTextContent("r");
    expect(screen.getByLabelText("rail")).toHaveTextContent("r");
    fireEvent.click(screen.getByRole("button", { name: "Full page" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { originReleaseId: "r" } }),
    );
  });

  it("drops origin context when the actual task belongs to a different project", () => {
    mocks.projectId = "other";
    render(
      <TaskDetailsSheet
        taskId="feature"
        projectId="p"
        workspaceId="w"
        originReleaseId="r"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("inline")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("button", { name: "Full page" }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: {} }),
    );
  });
});
