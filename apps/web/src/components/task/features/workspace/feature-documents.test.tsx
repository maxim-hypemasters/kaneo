import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import type { FeatureDocument } from "@/fetchers/feature/types";
import { FeatureDocuments } from "./feature-documents";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  canEdit: true,
  page: vi.fn(),
}));
vi.mock("@/fetchers/feature/feature-workspace", () => ({
  createFeatureDocument: m.create,
  getFeatureDocuments: m.list,
  getFeatureDocument: m.get,
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateFeatures: () => m.canEdit }),
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftNavigation: () => async (action: () => void) => {
    action();
    return true;
  },
}));
vi.mock("./feature-document-page", () => ({
  FeatureDocumentPage: (props: {
    document: FeatureDocument;
    focusTitle: boolean;
  }) => {
    m.page(props);
    return <h1>{props.document.title}</h1>;
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const created: FeatureDocument = {
  id: "created",
  featureId: "feature",
  title: "tasks:features.workspace.untitledDocument",
  body: "",
  revision: 1,
  createdBy: "author",
  updatedBy: "author",
  createdByName: "Author",
  updatedByName: "Author",
  createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z",
};
// While busy, the button's name also includes its spinner's label.
const newDocument = () =>
  screen.getByRole("button", {
    name: /tasks:features\.workspace\.newDocument/,
  });

function renderDocuments() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  function Harness() {
    const [selected, setSelected] = useState<string>();
    return (
      <FeatureDocuments
        featureId="feature"
        projectId="project"
        selectedDocumentId={selected}
        onDocumentChange={setSelected}
      />
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return { client, invalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.canEdit = true;
  m.list.mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 30, total: 0, totalPages: 0 },
  });
});
afterEach(cleanup);

describe("Feature documents", () => {
  it("creates an untitled document and opens it with the title selected", async () => {
    m.create.mockResolvedValue(created);
    const { invalidate } = renderDocuments();
    fireEvent.click(newDocument());
    expect(
      await screen.findByRole("heading", {
        name: "tasks:features.workspace.untitledDocument",
      }),
    ).toBeInTheDocument();
    expect(m.create).toHaveBeenCalledWith("feature", {
      title: "tasks:features.workspace.untitledDocument",
      body: "",
    });
    // Opened from the seeded cache, without reading it back.
    expect(m.get).not.toHaveBeenCalled();
    expect(m.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: created, focusTitle: true }),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["feature-workspace", "project", "feature", "documents"],
    });
  });

  it("shows the button busy while creating and an alert when it fails", async () => {
    let fail: ((error: Error) => void) | undefined;
    m.create.mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    renderDocuments();
    fireEvent.click(newDocument());
    await waitFor(() => expect(newDocument()).toBeDisabled());
    fireEvent.click(newDocument());
    await act(async () => fail?.(new Error("offline")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tasks:features.workspace.createDocumentFailed",
    );
    expect(newDocument()).toBeEnabled();
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.page).not.toHaveBeenCalled();
  });

  it("offers no New document without edit permission", async () => {
    m.canEdit = false;
    renderDocuments();
    expect(
      await screen.findByText("tasks:features.workspace.noDocuments"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "tasks:features.workspace.newDocument",
      }),
    ).not.toBeInTheDocument();
  });
});
