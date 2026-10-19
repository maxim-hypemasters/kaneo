import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { FeatureWork } from "./feature-work";
import type { MilestoneFilter } from "./feature-milestones";
import type { ReactNode } from "react";
import {
  MilestoneSelectionProvider,
  useMilestoneSelection,
} from "./milestone-selection-context";
const mocks = vi.hoisted(() => ({ milestones: [{ id: "m1" }] }));
vi.mock("@/hooks/queries/milestone/use-get-milestones", () => ({
  useGetMilestones: () => ({ data: mocks.milestones, isSuccess: true }),
}));
vi.mock("./feature-milestone-overview", () => ({
  FeatureMilestoneOverview: () => {
    const { setFilter: onFilter } = useMilestoneSelection();
    return (
      <>
        <button type="button" onClick={() => onFilter("none")}>
          Unassigned
        </button>
        <button type="button" onClick={() => onFilter({ id: "m1" })}>
          Alpha
        </button>
      </>
    );
  },
}));
vi.mock("../task-subtasks", () => ({
  default: ({ milestoneFilter }: { milestoneFilter: MilestoneFilter }) => (
    <div data-testid="tasks-filter">{JSON.stringify(milestoneFilter)}</div>
  ),
}));
function selection({ children }: { children: ReactNode }) {
  return <MilestoneSelectionProvider>{children}</MilestoneSelectionProvider>;
}
afterEach(() => {
  cleanup();
  mocks.milestones = [{ id: "m1" }];
});
it("defaults to all tasks when a different Feature opens", () => {
  const props = { projectId: "p", workspaceId: "w", featureStatus: "planned" };
  const { rerender } = render(
    <MilestoneSelectionProvider key="f1">
      <FeatureWork featureId="f1" {...props} />
    </MilestoneSelectionProvider>,
  );
  fireEvent.click(screen.getByText("Unassigned"));
  expect(screen.getByTestId("tasks-filter")).toHaveTextContent('"none"');
  rerender(
    <MilestoneSelectionProvider key="f2">
      <FeatureWork featureId="f2" {...props} />
    </MilestoneSelectionProvider>,
  );
  expect(screen.getByTestId("tasks-filter")).toHaveTextContent('"all"');
});
it("resets a deleted milestone filter to all tasks", () => {
  const props = {
    featureId: "f",
    projectId: "p",
    workspaceId: "w",
    featureStatus: "planned",
  };
  const { rerender } = render(<FeatureWork {...props} />, {
    wrapper: selection,
  });
  fireEvent.click(screen.getByText("Alpha"));
  expect(screen.getByTestId("tasks-filter")).toHaveTextContent('{"id":"m1"}');
  mocks.milestones = [];
  rerender(<FeatureWork {...props} />);
  expect(screen.getByTestId("tasks-filter")).toHaveTextContent('"all"');
});
