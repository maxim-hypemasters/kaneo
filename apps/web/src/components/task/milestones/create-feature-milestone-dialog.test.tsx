import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { TaskReleaseOriginProvider } from "../task-release-origin-context";
import { CreateFeatureMilestoneDialog } from "./create-feature-milestone-dialog";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";

const mocks = vi.hoisted(() => ({
  releases: undefined as Array<{ id: string; projectId: string }> | undefined,
  error: false,
  fetching: false,
  refetch: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({
    data: mocks.releases,
    isError: mocks.error,
    isFetching: mocks.fetching,
    isPending: mocks.releases === undefined,
    refetch: mocks.refetch,
  }),
}));
vi.mock("./milestone-dialog", () => ({
  MilestoneDialog: ({
    initialReleaseId,
  }: {
    initialReleaseId: string | null;
  }) => {
    const [releaseId, setReleaseId] = useState(initialReleaseId);
    return (
      <Dialog open>
        <DialogPopup>
          <DialogTitle>New milestone</DialogTitle>
          <input aria-label="Milestone title" autoFocus />
          <output aria-label="release">{releaseId ?? "none"}</output>
          <button type="button" onClick={() => setReleaseId(null)}>
            Clear release
          </button>
        </DialogPopup>
      </Dialog>
    );
  },
}));

beforeEach(() => {
  mocks.releases = undefined;
  mocks.error = false;
  mocks.fetching = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

function view(
  origin: { projectId: string; releaseId: string } | null = {
    projectId: "p",
    releaseId: "r",
  },
  onClose: () => void = vi.fn(),
) {
  return (
    <TaskReleaseOriginProvider origin={origin}>
      <CreateFeatureMilestoneDialog
        projectId="p"
        featureId="f"
        onClose={onClose}
      />
    </TaskReleaseOriginProvider>
  );
}

describe("milestone release creation context", () => {
  it("hands focus to the creation title after resolving instead of restoring the trigger", async () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Add milestone
          </button>
          {open && view()}
        </>
      );
    }
    const { rerender } = render(<Opener />);
    const trigger = screen.getByRole("button", { name: "Add milestone" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("status")).toHaveTextContent(
      "common:empty.loading",
    );
    mocks.releases = [{ id: "r", projectId: "p" }];
    rerender(<Opener />);
    await waitFor(() =>
      expect(screen.getByLabelText("Milestone title")).toHaveFocus(),
    );
  });

  it("restores focus to the opener when resolution is cancelled", async () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Add milestone
          </button>
          {open && view(undefined, () => setOpen(false))}
        </>
      );
    }
    render(<Opener />);
    const trigger = screen.getByRole("button", { name: "Add milestone" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("waits for accessible releases before initializing the form", () => {
    const { rerender } = render(view());
    expect(screen.getByRole("status")).toHaveTextContent(
      "common:empty.loading",
    );
    expect(screen.queryByLabelText("release")).not.toBeInTheDocument();
    mocks.releases = [{ id: "r", projectId: "p" }];
    rerender(view());
    expect(screen.getByLabelText("release")).toHaveTextContent("r");
  });

  it("offers retry and keeps the form uninitialized after resolution fails", () => {
    mocks.error = true;
    const { rerender } = render(view());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:milestones.releaseContextError",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(mocks.refetch).toHaveBeenCalledOnce();
    mocks.releases = [{ id: "r", projectId: "p" }];
    mocks.error = false;
    rerender(view());
    expect(screen.getByLabelText("release")).toHaveTextContent("r");
  });

  it("waits for a fresh read even with cached releases and handles a deleted origin", () => {
    mocks.releases = [{ id: "r", projectId: "p" }];
    mocks.fetching = true;
    const { rerender } = render(view());
    expect(screen.getByRole("status")).toHaveTextContent(
      "common:empty.loading",
    );
    expect(screen.queryByLabelText("release")).not.toBeInTheDocument();
    mocks.fetching = false;
    mocks.error = true;
    rerender(view());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:milestones.releaseContextError",
    );
    expect(screen.queryByLabelText("release")).not.toBeInTheDocument();
    mocks.error = false;
    mocks.releases = [];
    rerender(view());
    expect(screen.getByLabelText("release")).toHaveTextContent("none");
  });

  it("uses no release for a missing, deleted, or foreign-project origin", () => {
    mocks.releases = [{ id: "r", projectId: "other" }];
    const { rerender } = render(view());
    expect(screen.getByLabelText("release")).toHaveTextContent("none");
    rerender(
      <div key="deleted">{view({ projectId: "p", releaseId: "deleted" })}</div>,
    );
    expect(screen.getByLabelText("release")).toHaveTextContent("none");
    rerender(<div key="independent">{view(null)}</div>);
    expect(screen.getByLabelText("release")).toHaveTextContent("none");
    rerender(
      <div key="foreign-project">
        {view({ projectId: "other", releaseId: "r" })}
      </div>,
    );
    expect(screen.getByLabelText("release")).toHaveTextContent("none");
  });

  it("snapshots the origin and preserves an explicit No release override during refresh", () => {
    mocks.releases = [
      { id: "r", projectId: "p" },
      { id: "next", projectId: "p" },
    ];
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "Clear release" }));
    mocks.error = true;
    rerender(view({ projectId: "p", releaseId: "next" }));
    expect(screen.getByLabelText("release")).toHaveTextContent("none");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
