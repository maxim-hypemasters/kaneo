import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type Task from "@/types/task";
import {
  MilestoneSelectionProvider,
  useMilestoneSelection,
} from "../../milestones/milestone-selection-context";
import { FeatureWorkspace } from "./feature-workspace";

const state = vi.hoisted(() => ({
  tab: "overview",
  open: vi.fn(),
  featureDocumentId: undefined as string | undefined,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./use-feature-navigation", () => ({
  useFeatureNavigation: () => state,
}));
vi.mock("./feature-overview", () => ({
  FeatureOverview: () => <p>Overview content</p>,
}));
vi.mock("./feature-activity", () => ({
  FeatureActivity: () => <p>Activity content</p>,
}));
vi.mock("./feature-documents", () => ({
  FeatureDocuments: ({
    selectedDocumentId,
  }: {
    selectedDocumentId?: string;
  }) => <p>Document content {selectedDocumentId}</p>,
}));
vi.mock("./feature-issues", () => ({
  FeatureIssues: () => <p>Issues content</p>,
}));
vi.mock("../../milestones/feature-milestone-overview", () => ({
  FeatureMilestoneOverview: () => <MilestoneProbe />,
}));
function MilestoneProbe() {
  const { filter, selectFilter } = useMilestoneSelection();
  return (
    <>
      <output aria-label="filter">{JSON.stringify(filter)}</output>
      <button type="button" onClick={() => selectFilter({ id: "m1" })}>
        Select milestone
      </button>
    </>
  );
}
const feature = {
  id: "f",
  title: "Feature",
  projectId: "p",
  type: "feature",
} as Task;
const view = () => (
  <MilestoneSelectionProvider>
    <FeatureWorkspace feature={feature} workspaceId="w" />
  </MilestoneSelectionProvider>
);
afterEach(() => {
  cleanup();
  state.tab = "overview";
  state.featureDocumentId = undefined;
  state.open.mockReset();
});
it("mounts only the active tab and restores a document from URL state", () => {
  const { rerender } = render(view());
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByText("Overview content")).toBeInTheDocument();
  expect(screen.queryByText("Activity content")).not.toBeInTheDocument();
  expect(screen.queryByText("Issues content")).not.toBeInTheDocument();
  state.tab = "documents";
  state.featureDocumentId = "doc-1";
  rerender(view());
  expect(screen.getByText("Document content doc-1")).toBeInTheDocument();
  expect(screen.queryByText("Overview content")).not.toBeInTheDocument();
});
it("requests guarded tab navigation rather than mutating the selected tab", () => {
  render(view());
  fireEvent.click(
    screen.getByRole("tab", { name: "tasks:features.workspace.tabs.activity" }),
  );
  expect(state.open).toHaveBeenCalledWith("activity");
});
it("changes the milestone filter only after draft navigation is allowed", () => {
  render(view());
  fireEvent.click(screen.getByRole("button", { name: "Select milestone" }));
  expect(screen.getByLabelText("filter")).toHaveTextContent('"all"');
  expect(state.open).toHaveBeenCalledWith(
    "issues",
    undefined,
    expect.any(Function),
  );
});
