import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  openMilestoneDetails,
  useMilestoneDetailsStore,
} from "@/store/milestone-details";
import { MilestoneDetailsSheet } from "./milestone-details-sheet";
const mocks = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="#feature">{children}</a>
  ),
}));
vi.mock("@/fetchers/milestone/milestones", () => ({
  getMilestone: mocks.read,
}));
vi.mock("@/hooks/queries/task/use-feature-index", () => ({
  useFeatureIndex: () => ({
    features: new Map([["f", { title: "Battle knowledge" }]]),
  }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => true,
    canCreateTasks: () => true,
  }),
}));
vi.mock("@/hooks/mutations/milestone/use-milestone-mutations", () => ({
  useMilestoneMutations: () => ({
    update: { mutate: mocks.update, isPending: false },
  }),
}));
vi.mock("../features/use-feature-tasks", () => ({
  useFeatureTasks: () => ({
    ready: true,
    tasks: [
      {
        task: { id: "t", title: "Linked work", milestoneId: "m" },
        isCompleted: true,
      },
      {
        task: {
          id: "other",
          title: "Other milestone work",
          milestoneId: "other",
        },
        isCompleted: false,
      },
    ],
  }),
}));
vi.mock("./milestone-planning-fields", () => ({
  MilestonePlanningFields: ({
    onChange,
  }: {
    onChange: (value: { priority: "high" }) => void;
  }) => (
    <button onClick={() => onChange({ priority: "high" })}>
      Set milestone priority
    </button>
  ),
}));
vi.mock("@/components/shared/modals/create-task-modal", () => ({
  default: ({
    initialFeature,
    initialMilestoneId,
  }: {
    initialFeature: { id: string };
    initialMilestoneId: string;
  }) => (
    <div data-testid="creation-context">
      {initialFeature.id}/{initialMilestoneId}
    </div>
  ),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
afterEach(() => {
  cleanup();
  useMilestoneDetailsStore.getState().close();
  vi.clearAllMocks();
});
function view() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mocks.read.mockResolvedValue({
    id: "m",
    featureId: "f",
    title: "First release",
    status: "to-do",
    leadId: null,
    priority: "no-priority",
    releaseId: null,
    startDate: null,
    endDate: null,
    progress: { total: 2, started: 1, completed: 1 },
  });
  openMilestoneDetails("p", "m");
  render(
    <QueryClientProvider client={cache}>
      <MilestoneDetailsSheet projectId="p" workspaceId="w" />
    </QueryClientProvider>,
  );
}
describe("Milestone details", () => {
  it("edits planning metadata while retaining calculated work progress", async () => {
    view();
    expect(await screen.findByText("50% · 1/2")).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith(
      "m",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(screen.getByText("Battle knowledge")).toBeInTheDocument();
    expect(screen.getByText("Linked work")).toBeInTheDocument();
    expect(screen.queryByText("Other milestone work")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Set milestone priority" }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      { id: "m", priority: "high" },
      expect.anything(),
    );
    expect(screen.getByText("50% · 1/2")).toBeInTheDocument();
  });
  it("starts new linked work in the existing Feature and milestone", async () => {
    view();
    await screen.findByText("50% · 1/2");
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:milestones.addLinkedWork" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("creation-context")).toHaveTextContent("f/m"),
    );
  });
});
