import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { HttpError } from "@/lib/http-error";
import { CreateMasterplanningMilestoneDialog } from "./create-masterplanning-milestone-dialog";

type Feature = {
  id: string;
  title: string;
  number: number | null;
  status: string | null;
  archivedAt?: string | null;
};

const m = vi.hoisted(() => ({
  data: undefined as Feature[] | undefined,
  pending: false,
  error: false,
  failure: null as Error | null,
  fetching: false,
  refetch: vi.fn(),
  query: vi.fn(),
  dialog: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/queries/task/use-get-project-features", () => ({
  useGetProjectFeatures: (projectId: string) => {
    m.query(projectId);
    return {
      data: m.data,
      isPending: m.pending,
      isError: m.error,
      isFetching: m.fetching,
      error: m.failure,
      refetch: m.refetch,
    };
  },
}));
vi.mock("@/components/task/milestones/milestone-dialog", () => ({
  MilestoneDialog: (props: {
    projectId: string;
    featureId: string;
    featureName: string;
    initialReleaseId: string | null;
    finalFocus: ComponentProps<typeof DialogPopup>["finalFocus"];
    onClose: () => void;
  }) => {
    m.dialog(props);
    const [releaseId, setReleaseId] = useState(props.initialReleaseId);
    return (
      <Dialog open onOpenChange={(open) => !open && props.onClose()}>
        <DialogPopup finalFocus={props.finalFocus}>
          <DialogTitle>New milestone</DialogTitle>
          <p>{props.featureName}</p>
          <input aria-label="Milestone title" autoFocus />
          <output aria-label="release">{releaseId ?? "none"}</output>
          <button type="button" onClick={() => setReleaseId(null)}>
            Clear release
          </button>
          <button type="button" onClick={props.onClose}>
            Cancel milestone
          </button>
        </DialogPopup>
      </Dialog>
    );
  },
}));

const active: Feature = {
  id: "f1",
  title: "Feature one",
  number: 1,
  status: null,
};
const another: Feature = {
  id: "f2",
  title: "Other Feature",
  number: 2,
  status: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.data = [active, another];
  m.pending = false;
  m.error = false;
  m.failure = null;
  m.fetching = false;
});
afterEach(cleanup);

function view(
  initialReleaseId: string | null = "r1",
  onClose: () => void = vi.fn(),
) {
  return (
    <CreateMasterplanningMilestoneDialog
      projectId="p"
      initialReleaseId={initialReleaseId}
      onClose={onClose}
    />
  );
}

describe("Masterplanning milestone creation", () => {
  it("offers only existing active project Features and searches by title", async () => {
    m.data = [
      active,
      another,
      {
        id: "old",
        title: "Archived knowledge",
        number: 3,
        status: null,
        archivedAt: "2026-10-01",
      },
      { id: "legacy", title: "Legacy archived", number: 4, status: "archived" },
    ];
    render(view());
    expect(m.query).toHaveBeenCalledWith("p");
    expect(
      screen.getByText("tasks:releases.masterplanning.chooseFeature"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Feature one", "Other Feature"]);
    expect(m.dialog).not.toHaveBeenCalled();

    fireEvent.change(
      screen.getByPlaceholderText("common:modals.createTask.searchFeatures"),
      { target: { value: "other" } },
    );
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByRole("option")).toHaveTextContent("Other Feature");
    expect(screen.queryByText(/createFeature/)).not.toBeInTheDocument();
  });

  it("shows loading, error retry, and retained search until Features recover", async () => {
    m.data = undefined;
    m.pending = true;
    const { rerender } = render(view());
    expect(screen.getByRole("status")).toHaveTextContent(
      "common:modals.createTask.loadingFeatures",
    );
    fireEvent.change(
      screen.getByPlaceholderText("common:modals.createTask.searchFeatures"),
      { target: { value: "other" } },
    );
    m.pending = false;
    m.error = true;
    rerender(view());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "common:modals.createTask.loadFeaturesError",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(m.refetch).toHaveBeenCalledOnce();
    expect(m.dialog).not.toHaveBeenCalled();

    m.data = [active, another];
    m.error = false;
    rerender(view());
    expect(
      screen.getByPlaceholderText("common:modals.createTask.searchFeatures"),
    ).toHaveValue("other");
    await waitFor(() =>
      expect(screen.getByRole("option")).toHaveTextContent("Other Feature"),
    );
  });

  it("distinguishes no available Features from a search without matches", () => {
    m.data = [];
    const { rerender } = render(view());
    expect(screen.getByRole("status")).toHaveTextContent(
      "tasks:releases.masterplanning.noFeatures",
    );
    m.data = [active];
    rerender(view());
    fireEvent.change(
      screen.getByPlaceholderText("common:modals.createTask.searchFeatures"),
      { target: { value: "Missing" } },
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "common:modals.createTask.noFeaturesFound",
    );
    expect(m.dialog).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    "hides cached Feature choices after access is revoked (%s)",
    (status) => {
      const { rerender } = render(view());
      expect(
        screen.getByRole("option", { name: "Feature one" }),
      ).toBeInTheDocument();
      m.error = true;
      m.failure = new HttpError(status, "Access denied");
      rerender(view());
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      expect(screen.queryByText("Feature one")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "common:modals.createTask.loadFeaturesError",
      );
      expect(m.dialog).not.toHaveBeenCalled();
    },
  );

  it("hands the chosen immutable Feature and snapshotted release to the normal creation form", async () => {
    const { rerender } = render(view("r1"));
    rerender(view("r2"));
    fireEvent.click(screen.getByRole("option", { name: "Feature one" }));
    expect(m.dialog).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p",
        featureId: "f1",
        featureName: "Feature one",
        initialReleaseId: "r1",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Milestone title" }),
      ).toHaveFocus(),
    );
    expect(
      screen.queryByPlaceholderText("common:modals.createTask.searchFeatures"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear release" }));
    rerender(view("r2"));
    expect(screen.getByLabelText("release")).toHaveTextContent("none");
  });

  it("passes No release explicitly", () => {
    render(view(null));
    fireEvent.click(screen.getByRole("option", { name: "Feature one" }));
    expect(m.dialog).toHaveBeenCalledWith(
      expect.objectContaining({ initialReleaseId: null }),
    );
  });

  it.each([false, true])(
    "restores the original group trigger when cancelled (form open: %s)",
    async (openForm) => {
      function Opener() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              Add to release
            </button>
            {open && view("r1", () => setOpen(false))}
          </>
        );
      }
      render(<Opener />);
      const trigger = screen.getByRole("button", { name: "Add to release" });
      trigger.focus();
      fireEvent.click(trigger);
      if (openForm) {
        fireEvent.click(screen.getByRole("option", { name: "Feature one" }));
        await waitFor(() =>
          expect(
            screen.getByRole("textbox", { name: "Milestone title" }),
          ).toHaveFocus(),
        );
        fireEvent.click(
          screen.getByRole("button", { name: "Cancel milestone" }),
        );
      } else {
        fireEvent.click(
          screen.getByRole("button", { name: "common:actions.cancel" }),
        );
        expect(m.dialog).not.toHaveBeenCalled();
      }
      await waitFor(() => expect(trigger).toHaveFocus());
    },
  );
});
