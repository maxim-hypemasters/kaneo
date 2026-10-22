import {
  act,
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
import type { Release } from "@/types/release";
import { ReleaseDialog } from "./release-dialog";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  pending: false,
  releases: {} as Record<string, Release[]>,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/hooks/mutations/release/use-create-release", () => ({
  useCreateRelease: () => ({ mutateAsync: m.create, isPending: false }),
}));
vi.mock("@/hooks/mutations/release/use-update-release", () => ({
  useUpdateRelease: () => ({ mutateAsync: m.update, isPending: false }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: (projectId: string) => ({
    data: m.pending ? undefined : (m.releases[projectId] ?? []),
    isPending: m.pending,
  }),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-10-17",
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));
vi.mock("./use-can-link-release-milestones", () => ({
  useCanLinkReleaseMilestones: () => false,
}));

function release(name: string, overrides: Partial<Release> = {}): Release {
  return {
    id: "r1",
    projectId: "project-1",
    name,
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
    ...overrides,
  };
}

function Harness({
  projectId = "project-1",
  current = null,
}: {
  projectId?: string;
  current?: Release | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open release dialog
      </button>
      <ReleaseDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        release={current}
      />
    </>
  );
}

const nameInput = () =>
  screen.getByRole("textbox", { name: "tasks:releases.dialog.nameLabel" });

beforeEach(() => {
  m.pending = false;
  m.releases = { "project-1": [release("0.69")] };
  m.create.mockReset().mockResolvedValue(release("0.70", { id: "new" }));
  m.update.mockReset().mockResolvedValue(release("0.69"));
  m.success.mockReset();
  m.error.mockReset();
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
});
afterEach(cleanup);

describe("release name suggestions in the dialog", () => {
  it("waits for releases, then submits the suggested next version", async () => {
    m.pending = true;
    const view = render(<Harness />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    m.pending = false;
    view.rerender(<Harness />);
    expect(nameInput()).toHaveValue("0.70");

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "tasks:releases.dialog.create" }),
      );
    });
    expect(m.create).toHaveBeenCalledWith({
      projectId: "project-1",
      data: {
        name: "0.70",
        startDate: "2026-10-21",
        codeFreezeDate: "2026-11-04",
        submissionDate: "2026-11-09",
      },
    });
  });

  it.each(["Custom release", ""])(
    "preserves a manual name of %j during a background refresh",
    (manualName) => {
      const view = render(<Harness />);
      fireEvent.change(nameInput(), { target: { value: manualName } });

      m.releases["project-1"] = [release("0.70")];
      view.rerender(<Harness />);
      expect(nameInput()).toHaveValue(manualName);
    },
  );

  it("retains the name after a failed save", async () => {
    m.create.mockRejectedValue(new Error("Save failed"));
    render(<Harness />);
    fireEvent.change(nameInput(), { target: { value: "Custom release" } });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "tasks:releases.dialog.create" }),
      );
    });

    expect(m.error).toHaveBeenCalledWith("Save failed");
    expect(nameInput()).toHaveValue("Custom release");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("recalculates after cancelling and reopening the same dialog", async () => {
    const view = render(<Harness />);
    fireEvent.change(nameInput(), { target: { value: "Cancelled draft" } });
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    m.releases["project-1"] = [release("0.70")];
    view.rerender(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open release dialog" }),
    );

    expect(nameInput()).toHaveValue("0.71");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("recalculates for the selected project", () => {
    m.releases["project-2"] = [release("v1.4.9", { projectId: "project-2" })];
    const view = render(<Harness />);
    fireEvent.change(nameInput(), { target: { value: "Old project draft" } });

    view.rerender(<Harness projectId="project-2" />);

    expect(nameInput()).toHaveValue("v1.4.10");
  });

  it("keeps an existing release's name when editing", () => {
    render(<Harness current={release("0.69")} />);
    expect(nameInput()).toHaveValue("0.69");
  });
});
