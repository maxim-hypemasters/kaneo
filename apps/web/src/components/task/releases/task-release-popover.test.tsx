import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type Task from "@/types/task";
import { TaskReleasePopover } from "./task-release-popover";

const mocks = vi.hoisted(() => ({
  updateRelease: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  canUpdateTasks: vi.fn(),
  refetch: vi.fn(),
  releases: {} as {
    data?: unknown[];
    isPending: boolean;
    isError: boolean;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-release", () => ({
  useUpdateTaskRelease: () => ({ mutateAsync: mocks.updateRelease }),
}));
vi.mock("@/hooks/queries/release/use-get-releases", () => ({
  useGetReleases: () => ({ ...mocks.releases, refetch: mocks.refetch }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: mocks.canUpdateTasks }),
}));
vi.mock("@/lib/releases/use-release-today", () => ({
  useReleaseToday: () => "2026-10-17",
}));
vi.mock("@/lib/releases/release-date", () => ({
  formatReleaseRange: (start: string, end: string) => `${start}..${end}`,
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const release = (
  id: string,
  startDate: string,
  codeFreezeDate: string,
  submissionDate: string,
) => ({ id, name: id, startDate, codeFreezeDate, submissionDate });

const releases = [
  release("2.5", "2026-11-01", "2026-11-15", "2026-11-20"),
  release("2.3", "2026-08-01", "2026-08-20", "2026-08-31"),
  release("2.4", "2026-10-01", "2026-10-15", "2026-10-20"),
];

type PopoverTask = Pick<
  Task,
  "id" | "projectId" | "type" | "featureId" | "releaseId"
>;

const plainTask: PopoverTask = {
  id: "cart",
  projectId: "project-1",
  type: "task",
  featureId: null,
  releaseId: null,
};

let queryClient: QueryClient;

function renderPopover(task: PopoverTask = plainTask) {
  render(
    <QueryClientProvider client={queryClient}>
      <TaskReleasePopover task={task}>
        <button type="button">Release</button>
      </TaskReleasePopover>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Release" }));
}

async function pick(name: RegExp) {
  await act(async () => {
    fireEvent.click(await screen.findByRole("option", { name }));
  });
}

const optionTexts = async () =>
  (await screen.findAllByRole("option")).map((option) => option.textContent);

beforeEach(() => {
  queryClient = new QueryClient();
  mocks.canUpdateTasks.mockReturnValue(true);
  mocks.releases = { data: releases, isPending: false, isError: false };
  mocks.updateRelease.mockResolvedValue({ movedTaskIds: [] });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

describe("TaskReleasePopover", () => {
  it("lists no release, then active, upcoming and past releases with their dates", async () => {
    renderPopover();

    expect(await optionTexts()).toEqual([
      expect.stringMatching(/^tasks:releases.none/),
      expect.stringMatching(/^2\.42026-10-01\.\.2026-10-20/),
      expect.stringMatching(/^2\.52026-11-01\.\.2026-11-20/),
      expect.stringMatching(/^2\.32026-08-01\.\.2026-08-31/),
    ]);
  });

  it("marks the release of the task's feature", async () => {
    queryClient.setQueryData(["tasks", "project-1"], {
      columns: [
        {
          tasks: [
            { id: "checkout", type: "feature", releaseId: "2.5" },
            { id: "cart", type: "task", featureId: "checkout" },
          ],
        },
      ],
    });
    renderPopover({ ...plainTask, featureId: "checkout" });

    expect(
      await screen.findByRole("option", {
        name: /2\.5tasks:releases.featureReleaseHint/,
      }),
    ).toBeInTheDocument();
  });

  it("lets a name that starts with a digit be searched", async () => {
    renderPopover();
    const search = await screen.findByLabelText("tasks:releases.property");

    fireEvent.keyDown(search, { key: "2" });
    fireEvent.change(search, { target: { value: "2.5" } });

    expect(mocks.updateRelease).not.toHaveBeenCalled();
    expect(await optionTexts()).toEqual([
      expect.stringMatching(/^tasks:releases.none/),
      expect.stringMatching(/^2\.5/),
    ]);
  });

  it("puts the task in the picked release", async () => {
    renderPopover();

    await pick(/^2\.5/);

    await waitFor(() =>
      expect(mocks.updateRelease).toHaveBeenCalledWith({
        task: plainTask,
        releaseId: "2.5",
      }),
    );
    expect(mocks.updateRelease).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("takes the task out with no release", async () => {
    renderPopover({ ...plainTask, releaseId: "2.4" });

    await pick(/tasks:releases.none/);

    await waitFor(() =>
      expect(mocks.updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({ releaseId: null }),
      ),
    );
  });

  it("does nothing when the current release is picked again", async () => {
    renderPopover({ ...plainTask, releaseId: "2.4" });

    await pick(/^2\.4/);

    expect(mocks.updateRelease).not.toHaveBeenCalled();
  });

  it("says a feature's tasks follow it, and how many moved", async () => {
    mocks.updateRelease.mockResolvedValue({ movedTaskIds: ["a", "b"] });
    renderPopover({ ...plainTask, type: "feature" });

    expect(
      await screen.findByText("tasks:releases.followNote"),
    ).toBeInTheDocument();
    await pick(/^2\.4/);

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "tasks:releases.movedWithFeature:2",
        expect.anything(),
      ),
    );
  });

  it("reports a rejected change", async () => {
    mocks.updateRelease.mockRejectedValue(new Error("Release not found"));
    renderPopover();

    await pick(/^2\.5/);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Release not found"),
    );
  });

  it("keeps a release the project no longer lists, as unknown", async () => {
    renderPopover({ ...plainTask, releaseId: "gone" });

    const unknown = await screen.findByRole("option", {
      name: /tasks:releases.unknown/,
    });
    expect(unknown).toHaveAttribute("aria-current", "true");
  });

  it("says it is loading, and when the project has no releases", async () => {
    mocks.releases = { data: undefined, isPending: true, isError: false };
    renderPopover();
    expect(await screen.findByText("common:empty.loading")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    cleanup();

    mocks.releases = { data: [], isPending: false, isError: false };
    renderPopover();
    expect(
      await screen.findByText("tasks:releases.pickerEmpty"),
    ).toBeInTheDocument();
  });

  it("still takes the task out when the releases fail to load, and retries", async () => {
    mocks.releases = { data: undefined, isPending: false, isError: true };
    renderPopover({ ...plainTask, releaseId: "2.4" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tasks:releases.loadError",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.retry" }),
    );
    expect(mocks.refetch).toHaveBeenCalledTimes(1);

    await pick(/tasks:releases.none/);
    await waitFor(() =>
      expect(mocks.updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({ releaseId: null }),
      ),
    );
  });

  it("stays closed without update permission", () => {
    mocks.canUpdateTasks.mockReturnValue(false);
    renderPopover();

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
