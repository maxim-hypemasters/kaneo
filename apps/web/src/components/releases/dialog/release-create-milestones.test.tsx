import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import type { Release } from "@/types/release";
import { ReleaseDialog } from "./release-dialog";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  onClose: vi.fn(),
  refetch: vi.fn(),
  canLink: true,
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.title
        ? `${key} ${options.title}`
        : options?.count !== undefined
          ? `${key} ${options.count}`
          : key,
  }),
}));
vi.mock("@/hooks/mutations/release/use-create-release", () => ({
  useCreateRelease: () => ({ mutateAsync: m.create, isPending: false }),
}));
vi.mock("@/hooks/mutations/release/use-update-release", () => ({
  useUpdateRelease: () => ({ mutateAsync: m.update, isPending: false }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({ data: [release], isPending: false }),
}));
vi.mock("@/hooks/queries/release/use-release-milestone-candidates", () => ({
  useReleaseMilestoneCandidates: () => ({
    data: {
      data: [
        {
          id: "m",
          title: "Baseline",
          featureId: "f",
          featureTitle: "Feature A",
        },
      ],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: m.refetch,
  }),
}));
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("./use-can-link-release-milestones", () => ({
  useCanLinkReleaseMilestones: (enabled: boolean) => enabled && m.canLink,
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-10-17",
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const release: Release = {
  id: "r",
  projectId: "p",
  name: "Existing",
  description: null,
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  progress: {
    tasks: { total: 0, completed: 0 },
    features: { total: 0, completed: 0 },
    unfinished: 0,
  },
};
const name = () =>
  screen.getByRole("textbox", { name: "tasks:releases.dialog.nameLabel" });
const search = () =>
  screen.getByRole("searchbox", {
    name: "tasks:releases.milestonePicker.search",
  });
function view(editing = false) {
  return render(
    <ReleaseDialog
      open
      projectId="p"
      release={editing ? release : null}
      onOpenChange={m.onClose}
    />,
  );
}
function select() {
  fireEvent.focus(search());
  fireEvent.click(screen.getByRole("checkbox", { name: "Feature A Baseline" }));
}
async function submit() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.dialog.create" }),
    );
  });
}

beforeEach(() => {
  m.canLink = true;
  m.create.mockReset().mockResolvedValue({ ...release, id: "new" });
  m.update.mockReset().mockResolvedValue(release);
  m.onClose.mockReset();
  m.refetch.mockReset();
  m.success.mockReset();
  m.error.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});
afterEach(cleanup);

describe("release creation milestone links", () => {
  it("includes selected IDs in the single release creation request", async () => {
    view();
    select();
    fireEvent.change(name(), { target: { value: "New release" } });
    await submit();
    expect(m.create).toHaveBeenCalledExactlyOnceWith({
      projectId: "p",
      data: {
        name: "New release",
        startDate: "2026-10-21",
        codeFreezeDate: "2026-11-04",
        submissionDate: "2026-11-09",
        milestoneIds: ["m"],
      },
    });
    expect(m.onClose).toHaveBeenCalledWith(false);
  });

  it.each(["cancel", "create"])(
    "keeps results stable until the outside %s button receives its click",
    async (action) => {
      view();
      select();
      fireEvent.change(name(), { target: { value: "New release" } });
      const button = screen.getByRole("button", {
        name:
          action === "cancel"
            ? "common:actions.cancel"
            : "tasks:releases.dialog.create",
      });
      fireEvent.pointerDown(button);
      fireEvent.blur(search(), { relatedTarget: button });
      expect(
        screen.getByRole("checkbox", { name: "Feature A Baseline" }),
      ).toBeVisible();
      fireEvent.pointerUp(button);
      await act(async () => {
        fireEvent.click(button);
      });
      expect(m.onClose).toHaveBeenCalledWith(false);
      if (action === "cancel") expect(m.create).not.toHaveBeenCalled();
      else expect(m.create).toHaveBeenCalledOnce();
    },
  );

  it("retains selected milestones through client validation and cancellation writes nothing", async () => {
    view();
    select();
    await submit();
    expect(name()).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.milestonePicker.remove Feature A · Baseline",
      }),
    ).toBeVisible();
    expect(m.create).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );
    expect(m.onClose).toHaveBeenCalledWith(false);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("shows stale selection conflicts beside the picker while retaining all inputs", async () => {
    m.create.mockRejectedValue(
      new HttpError(409, "Changed", { code: "MILESTONE_SELECTION_CONFLICT" }),
    );
    view();
    select();
    fireEvent.change(name(), { target: { value: "New release" } });
    await submit();
    expect(name()).toHaveValue("New release");
    expect(name()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.milestonePicker.conflict",
    );
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.milestonePicker.remove Feature A · Baseline",
      }),
    ).toBeVisible();
    expect(m.refetch).not.toHaveBeenCalled();
    fireEvent.focus(search());
    expect(m.refetch).toHaveBeenCalledOnce();
    expect(m.onClose).not.toHaveBeenCalled();
    expect(m.error).not.toHaveBeenCalled();
  });

  it("marks only duplicate-name conflicts on the name field", async () => {
    m.create.mockRejectedValue(
      new HttpError(409, "Duplicate", { code: "RELEASE_NAME_TAKEN" }),
    );
    view();
    select();
    fireEvent.change(name(), { target: { value: "New release" } });
    await submit();
    expect(name()).toHaveAccessibleDescription("tasks:releases.ux.nameTaken");
    expect(
      screen.queryByText("tasks:releases.milestonePicker.conflict"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.milestonePicker.remove Feature A · Baseline",
      }),
    ).toBeVisible();
  });

  it("keeps other creation conflicts out of the name error", async () => {
    m.create.mockRejectedValue(
      new HttpError(409, "Project moved", { code: "CONFLICT" }),
    );
    view();
    fireEvent.change(name(), { target: { value: "New release" } });
    await submit();
    expect(name()).not.toHaveAttribute("aria-invalid");
    expect(m.error).toHaveBeenCalledWith("Project moved");
  });

  it("allows creation without milestone-management permission and leaves editing unchanged", async () => {
    m.canLink = false;
    const current = view();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    fireEvent.change(name(), { target: { value: "New release" } });
    await submit();
    expect(m.create.mock.calls[0][0].data).not.toHaveProperty("milestoneIds");
    current.unmount();
    m.canLink = true;
    view(true);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("blocks editing and every dismissal path during creation", async () => {
    let resolve!: (value: unknown) => void;
    m.create.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    view();
    select();
    fireEvent.change(name(), { target: { value: "New release" } });
    await submit();
    expect(name()).toBeDisabled();
    expect(search()).toBeDisabled();
    for (const label of ["startLabel", "codeFreezeLabel", "submissionLabel"]) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`tasks:releases\\.dialog\\.${label}`),
        }),
      ).toBeDisabled();
    }
    expect(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.milestonePicker.remove Feature A · Baseline",
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]')!;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(m.onClose).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledOnce();
    await act(async () => {
      resolve({ ...release, id: "new" });
    });
    expect(m.onClose).toHaveBeenCalledExactlyOnceWith(false);
  });
});
