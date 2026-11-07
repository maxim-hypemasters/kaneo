import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { DocumentEditorProps } from "@/components/editor/document-editor-types";
import type { FeatureDocument } from "@/fetchers/feature/types";
import { FeatureDocumentPage } from "./feature-document-page";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  guard: { dirty: false, saving: false },
  canEdit: true,
  expandable: undefined as boolean | undefined,
}));
vi.mock("@/fetchers/feature/feature-workspace", () => ({
  createFeatureDocument: m.create,
  updateFeatureDocument: m.update,
  deleteFeatureDocument: m.remove,
}));
vi.mock("@/hooks/queries/feature/use-feature-workspace", () => ({
  featureWorkspaceKey: (project: string, feature: string) => [
    "feature-workspace",
    project,
    feature,
  ],
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => m.canEdit,
    canDeleteTasks: () => m.canEdit,
  }),
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftGuard: (guard: { dirty: boolean; saving: boolean }) => {
    m.guard = guard;
  },
}));
vi.mock("@/components/editor/document-editor", () => ({
  DocumentEditor: ({
    value,
    readOnly,
    disabled,
    onChange,
    onRequestEdit,
    footer,
    notice,
    expandable,
  }: DocumentEditorProps) => {
    m.expandable = expandable;
    return (
      <div>
        {readOnly ? (
          <button type="button" onClick={onRequestEdit}>
            Read {value}
          </button>
        ) : (
          <textarea
            aria-label="Body"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange?.(event.target.value)}
          />
        )}
        {notice}
        {footer}
      </div>
    );
  },
}));
vi.mock("./workspace-delete-dialog", () => ({
  WorkspaceDeleteDialog: ({
    open,
    pending,
    onConfirm,
  }: {
    open: boolean;
    pending: boolean;
    onConfirm: () => void;
  }) =>
    open ? (
      <button type="button" disabled={pending} onClick={onConfirm}>
        Confirm deletion
      </button>
    ) : null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
const document: FeatureDocument = {
  id: "document",
  featureId: "feature",
  title: "Design",
  body: "Original",
  revision: 1,
  createdBy: "author",
  updatedBy: "author",
  createdByName: "Author",
  updatedByName: "Author",
  createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z",
};
function renderPage(
  props: Partial<Parameters<typeof FeatureDocumentPage>[0]> = {},
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <FeatureDocumentPage
      featureId="feature"
      projectId="project"
      document={document}
      onBack={vi.fn()}
      onSaved={vi.fn()}
      refresh={vi.fn()}
      {...props}
    />,
    { wrapper },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.canEdit = true;
  m.guard = { dirty: false, saving: false };
});
afterEach(cleanup);

describe("Feature document page", () => {
  it("opens full screen and returns with All documents or Escape", () => {
    const onBack = vi.fn();
    renderPage({ onBack });
    const dialog = screen.getByRole("dialog", { name: "Design" });
    expect(dialog).toContainElement(
      screen.getByRole("heading", { name: "Design" }),
    );
    // The window already fills the screen, so the editor offers no Expand.
    expect(m.expandable).toBe(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:features.workspace.allDocuments",
      }),
    );
    expect(onBack).toHaveBeenCalledOnce();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("clears the dirty guard before navigating from a successfully created document", async () => {
    m.create.mockResolvedValue(document);
    const onSaved = vi.fn(() =>
      expect(m.guard).toMatchObject({ dirty: false, saving: false }),
    );
    renderPage({ document: undefined, onSaved });
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "tasks:features.workspace.documentTitle",
      }),
      { target: { value: "New document" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "New text" },
    });
    expect(m.guard.dirty).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "common:documentEditor.save" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it("waits until the pending guard clears before returning after deletion", async () => {
    let resolve: (() => void) | undefined;
    m.remove.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const onBack = vi.fn(() => expect(m.guard.saving).toBe(false));
    renderPage({ onBack });
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:features.workspace.deleteDocument",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(m.guard.saving).toBe(true));
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => resolve?.());
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  });

  it("retains failed title and body edits while showing retry feedback", async () => {
    m.update.mockRejectedValue(new Error("offline"));
    renderPage();
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:features.workspace.renameDocument",
      }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "tasks:features.workspace.documentTitle",
      }),
      { target: { value: "Renamed" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Body" }), {
      target: { value: "Draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "common:documentEditor.save" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "common:documentEditor.saveFailed",
      ),
    );
    expect(screen.getByRole("textbox", { name: "Body" })).toHaveValue("Draft");
    expect(
      screen.getByRole("textbox", {
        name: "tasks:features.workspace.documentTitle",
      }),
    ).toHaveValue("Renamed");
  });
});
