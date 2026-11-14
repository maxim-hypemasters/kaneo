import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import SearchCommandMenu from "./index";

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  setOpen: vi.fn(),
  results: [] as unknown[],
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => m.navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/project/views/use-open-project", () => ({
  useOpenProject: () => vi.fn(),
}));
vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace" } }),
}));
vi.mock("@/hooks/queries/search/use-global-search", () => ({
  default: () => ({ data: { results: m.results } }),
}));

const TASK_ROUTE =
  "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId";

function search(query = "retry") {
  render(<SearchCommandMenu open setOpen={m.setOpen} />);
  fireEvent.change(
    screen.getByPlaceholderText("navigation:search.inputPlaceholder"),
    { target: { value: query } },
  );
}

beforeEach(() => {
  m.navigate.mockClear();
  m.results = [];
});
afterEach(cleanup);

describe("SearchCommandMenu", () => {
  it("opens a Feature document from its search result", () => {
    m.results = [
      {
        id: "document",
        type: "document",
        title: "Rollout plan",
        content: "…stage the payment retry rollout…",
        featureId: "feature",
        featureTitle: "Checkout",
        projectId: "project",
      },
    ];
    search();

    expect(screen.getByText("navigation:search.groups.document")).toBeTruthy();
    expect(
      screen.getByText("Checkout · …stage the payment retry rollout…"),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Rollout plan"));

    expect(m.navigate).toHaveBeenCalledWith({
      to: TASK_ROUTE,
      params: {
        workspaceId: "workspace",
        projectId: "project",
        taskId: "feature",
      },
      search: { featureTab: "documents", featureDocumentId: "document" },
    });
  });

  it("opens a project page on its project's home page", () => {
    m.results = [
      {
        id: "page",
        type: "document",
        title: "Team handbook",
        content: "…how we retry payments…",
        projectId: "project",
        projectName: "Payments",
      },
    ];
    search();

    expect(screen.getByText("Payments · …how we retry payments…")).toBeTruthy();
    fireEvent.click(screen.getByText("Team handbook"));

    expect(m.navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/$workspaceId/project/$projectId",
      params: { workspaceId: "workspace", projectId: "project" },
      search: { tab: "documents", documentId: "page" },
    });
  });

  it("lists Features in their own group, marks archived ones and opens them", () => {
    m.results = [
      {
        id: "feature",
        type: "feature",
        taskType: "feature",
        title: "Checkout",
        projectId: "project",
        archived: true,
      },
      {
        id: "task",
        type: "task",
        taskType: "task",
        title: "Checkout retries",
        projectId: "project",
      },
    ];
    search("checkout");

    expect(screen.getByText("navigation:search.groups.feature")).toBeTruthy();
    expect(screen.getByText("navigation:search.groups.task")).toBeTruthy();
    expect(screen.getByText("tasks:features.library.archived")).toBeTruthy();
    expect(
      screen.getByLabelText(
        "tasks:features.typeFeature: Checkout, tasks:features.library.archived",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Checkout"));

    expect(m.navigate).toHaveBeenCalledWith({
      to: TASK_ROUTE,
      params: {
        workspaceId: "workspace",
        projectId: "project",
        taskId: "feature",
      },
      search: {},
    });
  });

  it("opens a Feature comment in the Feature's Activity tab", () => {
    m.results = [
      {
        id: "comment",
        type: "comment",
        title: "Comment on Checkout",
        taskId: "feature",
        taskType: "feature",
        projectId: "project",
      },
    ];
    search("checkout");
    fireEvent.click(screen.getByText("Comment on Checkout"));

    expect(m.navigate).toHaveBeenCalledWith({
      to: TASK_ROUTE,
      params: {
        workspaceId: "workspace",
        projectId: "project",
        taskId: "feature",
      },
      search: { featureTab: "activity" },
    });
  });

  it("opens the task an activity belongs to, not the activity id", () => {
    m.results = [
      {
        id: "activity",
        type: "activity",
        title: "Status changed on Retry payments",
        taskId: "task",
        taskType: "bug",
        projectId: "project",
      },
    ];
    search();
    fireEvent.click(screen.getByText("Status changed on Retry payments"));

    expect(m.navigate).toHaveBeenCalledWith({
      to: TASK_ROUTE,
      params: {
        workspaceId: "workspace",
        projectId: "project",
        taskId: "task",
      },
    });
  });

  it("marks only a task result as a Bug, not the comments and activity on it", () => {
    m.results = [
      {
        id: "bug",
        type: "task",
        taskType: "bug",
        title: "Retry payments",
        projectId: "project",
      },
      {
        id: "comment",
        type: "comment",
        title: "Comment on Retry payments",
        taskId: "bug",
        taskType: "bug",
        projectId: "project",
      },
      {
        id: "activity",
        type: "activity",
        title: "Status changed on Retry payments",
        taskId: "bug",
        taskType: "bug",
        projectId: "project",
      },
    ];
    search();

    expect(
      screen.getByLabelText("tasks:features.typeBug: Retry payments"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("comment: Comment on Retry payments"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("activity: Status changed on Retry payments"),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("img", { name: "tasks:features.typeBug" }),
    ).toHaveLength(1);
  });

  it("does not open an activity without the item it belongs to", () => {
    m.results = [
      {
        id: "activity",
        type: "activity",
        title: "Created Retry payments",
        projectId: "project",
      },
    ];
    search();
    fireEvent.click(screen.getByText("Created Retry payments"));

    expect(m.navigate).not.toHaveBeenCalled();
  });
});
