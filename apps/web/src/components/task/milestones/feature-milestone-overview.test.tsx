import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { FeatureMilestoneOverview } from "./feature-milestone-overview";
import { FeatureWork } from "./feature-work";
import { MilestoneSelectionProvider } from "./milestone-selection-context";
import type { MilestoneFilter } from "./feature-milestones";
const mocks = vi.hoisted(() => ({ rail: true }));
vi.mock("../properties/use-task-rail-visible", () => ({
  useTaskRailVisible: () => mocks.rail,
}));
vi.mock("@/hooks/queries/milestone/use-get-milestones", () => ({
  useGetMilestones: () => ({ data: [{ id: "m1" }], isSuccess: true }),
}));
vi.mock("./feature-milestones", () => ({
  FeatureMilestones: ({
    filter,
    onFilter,
  }: {
    filter: MilestoneFilter;
    onFilter: (filter: MilestoneFilter) => void;
  }) => (
    <section aria-label="Milestones">
      <button type="button" onClick={() => onFilter({ id: "m1" })}>
        Alpha
      </button>
      <button type="button" onClick={() => onFilter("none")}>
        No milestone
      </button>
      <span data-testid="overview-filter">{JSON.stringify(filter)}</span>
    </section>
  ),
}));
vi.mock("../task-subtasks", () => ({
  default: ({ milestoneFilter }: { milestoneFilter: MilestoneFilter }) => (
    <div data-testid="tasks-filter">{JSON.stringify(milestoneFilter)}</div>
  ),
}));
afterEach(() => {
  cleanup();
  mocks.rail = true;
});
function view() {
  return (
    <MilestoneSelectionProvider>
      <main>
        <FeatureWork
          featureId="f"
          projectId="p"
          workspaceId="w"
          featureStatus="planned"
        />
      </main>
      <aside>
        <FeatureMilestoneOverview
          projectId="p"
          featureId="f"
          placement="rail"
        />
      </aside>
    </MilestoneSelectionProvider>
  );
}
it("renders only the sidebar overview on desktop and filters the main Tasks", () => {
  render(view());
  expect(screen.getAllByRole("region", { name: "Milestones" })).toHaveLength(1);
  expect(
    within(screen.getByRole("main")).queryByRole("region", {
      name: "Milestones",
    }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("complementary")).toContainElement(
    screen.getByRole("region", { name: "Milestones" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
  expect(screen.getByTestId("tasks-filter")).toHaveTextContent('{"id":"m1"}');
});
it("moves the same overview inline on mobile and retains the selected filter", () => {
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole("button", { name: "No milestone" }));
  mocks.rail = false;
  rerender(view());
  expect(screen.getAllByRole("region", { name: "Milestones" })).toHaveLength(1);
  expect(screen.getByRole("main")).toContainElement(
    screen.getByRole("region", { name: "Milestones" }),
  );
  expect(
    within(screen.getByRole("complementary")).queryByRole("region", {
      name: "Milestones",
    }),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId("tasks-filter")).toHaveTextContent('"none"');
  expect(screen.getByTestId("overview-filter")).toHaveTextContent('"none"');
});
