import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { FeatureActivityItem } from "@/fetchers/feature/types";
import { FeatureActivity } from "./feature-activity";

const m = vi.hoisted(() => ({
  feed: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  selected: {
    data: undefined as FeatureActivityItem | undefined,
    isError: false,
    refetch: vi.fn(),
  },
  useSelected: vi.fn(),
}));
vi.mock("@/hooks/queries/feature/use-feature-workspace", () => ({
  featureWorkspaceKey: (project: string, feature: string) => [
    "feature-workspace",
    project,
    feature,
  ],
  useFeatureActivity: () => m.feed,
  useFeatureUpdate: (...args: unknown[]) => {
    m.useSelected(...args);
    return m.selected;
  },
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftNavigation: () => (action: () => void) => {
    action();
    return Promise.resolve(true);
  },
}));
vi.mock("./feature-update-composer", () => ({
  FeatureUpdateComposer: ({ header }: { header?: ReactNode }) => (
    <div>
      {header}
      <div>Update composer</div>
    </div>
  ),
}));
vi.mock("./feature-comment-composer", () => ({
  FeatureCommentComposer: () => <div>Comment composer</div>,
}));
vi.mock("./feature-update-card", () => ({
  FeatureUpdateCard: ({ activity }: { activity: FeatureActivityItem }) => (
    <article data-testid="report" id={`feature-update-${activity.id}`}>
      {activity.content}
    </article>
  ),
}));
vi.mock("@/components/activity", () => ({
  default: ({
    activity,
    subject,
  }: {
    activity: FeatureActivityItem;
    subject?: string;
  }) => <div data-subject={subject}>{activity.content}</div>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const report: FeatureActivityItem = {
  id: "old-report",
  taskId: "feature",
  type: "feature_update",
  content: "Old latest report",
  userId: "author",
  userName: "Author",
  userImage: null,
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  eventData: {},
};
const system = {
  ...report,
  id: "system",
  type: "created",
  content: "Recent system event",
};
function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <FeatureActivity
      projectId="project"
      featureId="feature"
      selectedUpdateId="old-report"
    />,
    { wrapper },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.feed.data = { data: [system], pagination: { page: 1, totalPages: 2 } };
  m.feed.isPending = false;
  m.feed.isError = false;
  m.selected.data = undefined;
  m.selected.isError = false;
});
afterEach(cleanup);

describe("Feature Activity selected report", () => {
  it("opens an older latest report without paging through unrelated history", () => {
    m.selected.data = report;
    setup();
    expect(m.useSelected).toHaveBeenLastCalledWith(
      "project",
      "feature",
      "old-report",
      true,
    );
    expect(screen.getByText("Old latest report")).toBeInTheDocument();
    expect(screen.getByText("Recent system event")).toBeInTheDocument();
  });
  it("renders a selected report once and skips its read when it is already in the feed", () => {
    m.feed.data = {
      data: [system, report],
      pagination: { page: 1, totalPages: 1 },
    };
    setup();
    expect(m.useSelected).toHaveBeenLastCalledWith(
      "project",
      "feature",
      "old-report",
      false,
    );
    expect(screen.getAllByTestId("report")).toHaveLength(1);
  });
  it("does not start the selected report read before the first feed page resolves", () => {
    m.feed.data = undefined;
    m.feed.isPending = true;
    setup();
    expect(m.useSelected).toHaveBeenLastCalledWith(
      "project",
      "feature",
      "old-report",
      false,
    );
  });
  it("words history events for the Feature", () => {
    setup();
    expect(screen.getByText("Recent system event")).toHaveAttribute(
      "data-subject",
      "feature",
    );
  });
  it("shows retry feedback for an unavailable direct report without hiding the history", () => {
    m.selected.isError = true;
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:features.workspace.loadFailed",
    );
    expect(screen.getByText("Recent system event")).toBeInTheDocument();
  });
});
