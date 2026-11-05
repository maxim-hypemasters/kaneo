import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type TaskDetailsSheet from "@/components/task/task-details-sheet";
import { ReleasePlanPreviewContent } from "./release-plan-preview-content";
import {
  previewRelease,
  previewTask,
  releasePreview,
} from "./preview/preview-fixtures";

const m = vi.hoisted(() => ({
  sheet: null as ComponentProps<typeof TaskDetailsSheet> | null,
  allowLeave: true,
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  requestDocumentDraftLeave: async () => m.allowLeave,
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/components/task/task-details-sheet", () => ({
  default: (props: ComponentProps<typeof TaskDetailsSheet>) => {
    m.sheet = props;
    return props.taskId ? (
      <div role="dialog" aria-label="Task details">
        <span>{props.taskId}</span>
        <button type="button" onClick={props.onClose}>
          Close task details
        </button>
      </div>
    ) : null;
  },
}));
vi.mock("./preview/release-plan-timeline", () => ({
  ReleasePlanTimeline: ({
    focusRequest,
    preview,
  }: {
    focusRequest?: { taskId: string; requestId: number };
    preview: { revision: string };
  }) => (
    <div aria-label="Reviewed chart">
      <span>{preview.revision}</span>
      <output data-testid="focus-request">
        {JSON.stringify(focusRequest ?? null)}
      </output>
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  m.sheet = null;
  m.allowLeave = true;
});
const task = previewTask("a");
const preview = releasePreview([task], {
  warnings: [{ taskId: "a", reason: "after_code_freeze" }],
});
const planner = {
  query: { data: { tasks: [task] } },
  calculate: { isPending: false },
  apply: { isPending: false },
  inputSaving: false,
  resolutionTasks: [task],
  changes: {},
  applied: false,
  updateChanges: vi.fn(),
} as unknown as ComponentProps<typeof ReleasePlanPreviewContent>["planner"];
const props = {
  open: true,
  projectId: "project",
  workspaceId: "workspace",
  release: previewRelease,
  preview,
  planner,
  canPlan: true,
};

describe("preview conflict navigation", () => {
  it("opens the existing task sheet over the reviewed chart and restores its own identifier focus target", async () => {
    render(<ReleasePlanPreviewContent {...props} />);
    const identifier = screen.getByRole("link", { name: task.identifier! });
    expect(identifier).toHaveAttribute(
      "href",
      "/dashboard/workspace/workspace/project/project/task/a?originReleaseId=release",
    );
    await act(async () => fireEvent.click(identifier));
    expect(
      screen.getByRole("dialog", { name: "Task details" }),
    ).toHaveTextContent("a");
    expect(m.sheet).toEqual(
      expect.objectContaining({
        projectId: "project",
        workspaceId: "workspace",
        originReleaseId: "release",
      }),
    );
    expect(screen.getByLabelText("Reviewed chart")).toHaveTextContent("token");
    expect(screen.getByTestId("focus-request")).toHaveTextContent("null");
    fireEvent.click(screen.getByRole("button", { name: "Close task details" }));
    expect(
      screen.queryByRole("dialog", { name: "Task details" }),
    ).not.toBeInTheDocument();
    expect(typeof m.sheet?.finalFocus).toBe("function");
    const finalFocus = m.sheet!.finalFocus as () => HTMLElement;
    expect(finalFocus()).toBe(identifier);
    expect(screen.getByLabelText("Reviewed chart")).toHaveTextContent("token");
  });

  it("retains the current task state when discarding is cancelled and permits a later retry", async () => {
    m.allowLeave = false;
    render(<ReleasePlanPreviewContent {...props} />);
    const identifier = screen.getByRole("link", { name: task.identifier! });
    await act(async () => fireEvent.click(identifier));
    expect(
      screen.queryByRole("dialog", { name: "Task details" }),
    ).not.toBeInTheDocument();
    m.allowLeave = true;
    await act(async () => fireEvent.click(identifier));
    expect(
      screen.getByRole("dialog", { name: "Task details" }),
    ).toHaveTextContent("a");
  });

  it("sends fresh focus requests for repeated card activation without opening task details", () => {
    render(<ReleasePlanPreviewContent {...props} />);
    const focus = screen.getByRole("button", {
      name: "tasks:releases.planning.resolution.focusTask",
    });
    fireEvent.click(focus);
    expect(screen.getByTestId("focus-request")).toHaveTextContent(
      '{"taskId":"a","requestId":1}',
    );
    fireEvent.click(focus);
    expect(screen.getByTestId("focus-request")).toHaveTextContent(
      '{"taskId":"a","requestId":2}',
    );
    expect(
      screen.queryByRole("dialog", { name: "Task details" }),
    ).not.toBeInTheDocument();
  });
});
