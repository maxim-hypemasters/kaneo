import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { ReleasePlanPreviewContent } from "../release-plan-preview-content";
import {
  previewRelease,
  previewTask,
  releasePreview,
} from "../preview/preview-fixtures";

const m = vi.hoisted(() => ({
  releases: {
    data: [] as unknown[] | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => m.releases,
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("./release-plan-resolution", () => ({
  ReleasePlanResolution: ({ pending }: { pending: boolean }) => (
    <button type="button" disabled={pending}>
      Resolve conflict
    </button>
  ),
}));

const planner = {
  query: { data: undefined },
  calculate: { isPending: false },
  apply: { isPending: false },
  inputSaving: false,
  resolutionTasks: [],
  changes: {},
  applied: false,
  updateChanges: vi.fn(),
} as unknown as ComponentProps<typeof ReleasePlanPreviewContent>["planner"];

function content() {
  return (
    <ReleasePlanPreviewContent
      open
      projectId="project"
      workspaceId="workspace"
      release={previewRelease}
      preview={releasePreview([previewTask("a")])}
      planner={planner}
      canPlan
    />
  );
}

beforeEach(() => {
  m.releases.data = [];
  m.releases.isPending = false;
  m.releases.isError = false;
  m.releases.refetch.mockReset();
});
afterEach(cleanup);

describe("fullscreen release preview layout", () => {
  it("positions conflict controls beside the timeline with independent scrolling and a stacked mobile fallback", () => {
    render(content());
    const body = screen.getByTestId("release-plan-preview-content");
    const panel = screen.getByRole("complementary", {
      name: "tasks:gantt.taskHeader",
    });
    const scroller = screen.getByTestId("release-plan-timeline-scroll");
    const controls = within(panel).getByRole("button", {
      name: "Resolve conflict",
    });
    expect(body).toHaveClass("overflow-hidden", "md:flex-row");
    expect(panel).toHaveClass("overflow-y-auto", "max-h-[30dvh]", "md:w-88");
    expect(panel).toHaveAttribute("tabindex", "0");
    expect(panel.parentElement).toBe(body);
    expect(scroller.closest("aside")).toBeNull();
    expect(controls.closest("[data-gantt-scroll-container]")).toBeNull();
    expect(
      scroller.querySelector("[data-gantt-preview-date-header]"),
    ).toHaveClass("sticky");
    expect(
      panel.compareDocumentPosition(scroller) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByTestId("release-plan-timeline-scroll")).toHaveLength(
      1,
    );
  });

  it("keeps release-list retry feedback in the left panel without replacing the reviewed timeline", () => {
    m.releases.isError = true;
    render(content());
    const panel = screen.getByTestId("release-plan-resolution-panel");
    expect(
      within(panel).getByText(
        "tasks:releases.planning.resolution.releasesError",
      ),
    ).toBeVisible();
    expect(
      within(panel).getByRole("button", { name: "Resolve conflict" }),
    ).toBeDisabled();
    fireEvent.click(
      within(panel).getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(m.releases.refetch).toHaveBeenCalledOnce();
    expect(screen.getByTestId("release-plan-timeline-scroll")).toBeVisible();
  });

  it("removes viewport gutters and rounded edges only for fullscreen dialogs", () => {
    const view = render(
      <Dialog open>
        <DialogPopup fullscreen aria-describedby={undefined}>
          <DialogTitle>Fullscreen preview</DialogTitle>
          {content()}
        </DialogPopup>
      </Dialog>,
    );
    const popup = screen.getByRole("dialog", { name: "Fullscreen preview" });
    expect(popup).toHaveClass(
      "h-dvh",
      "max-w-none",
      "rounded-none",
      "row-start-1",
    );
    expect(popup.parentElement).toHaveClass("grid-rows-1", "p-0");
    expect(popup.parentElement).not.toHaveClass("max-sm:pt-12");
    view.rerender(
      <Dialog open>
        <DialogPopup aria-describedby={undefined}>
          <DialogTitle>Ordinary dialog</DialogTitle>
        </DialogPopup>
      </Dialog>,
    );
    const ordinary = screen.getByRole("dialog", { name: "Ordinary dialog" });
    expect(ordinary).toHaveClass("max-w-lg", "rounded-2xl", "row-start-2");
    expect(ordinary).not.toHaveClass("h-dvh", "rounded-none");
    expect(ordinary.parentElement).toHaveClass("p-4", "max-sm:pt-12");
  });
});
