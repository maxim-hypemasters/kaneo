import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactNode, useImperativeHandle } from "react";
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
import { HttpError } from "@/lib/http-error";
import { FeatureDocumentPage } from "./feature-document-page";

type Guard = {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  flush?: () => Promise<boolean>;
  finish?: () => Promise<void>;
};
const m = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  prune: vi.fn(),
  guard: undefined as Guard | undefined,
  canEdit: true,
  editor: undefined as DocumentEditorProps | undefined,
  focus: vi.fn(),
}));
vi.mock("@/fetchers/feature/feature-workspace", () => ({
  updateFeatureDocument: m.update,
  deleteFeatureDocument: m.remove,
  pruneFeatureAssets: m.prune,
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
  useDocumentDraftGuard: (guard: Guard) => {
    m.guard = guard;
  },
}));
vi.mock("@/components/editor/document-editor", () => ({
  DocumentEditor: (props: DocumentEditorProps) => {
    useImperativeHandle(props.ref, () => ({ focus: m.focus }));
    // The conflict notice renders a read-only editor of its own.
    if (props.variant === "page") m.editor = props;
    return (
      <div>
        {props.readOnly ? (
          <p>Read {props.value}</p>
        ) : (
          <textarea
            aria-label="Body"
            value={props.value}
            disabled={props.disabled}
            onChange={(event) => props.onChange?.(event.target.value)}
          />
        )}
        {props.notice}
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

const original: FeatureDocument = {
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
type Props = Parameters<typeof FeatureDocumentPage>[0];

function renderPage(props: Partial<Props> = {}) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const all: Props = {
    featureId: "feature",
    projectId: "project",
    document: original,
    onBack: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...props,
  };
  const view = render(<FeatureDocumentPage {...all} />, { wrapper });
  return {
    ...view,
    props: all,
    rerender: (next: Partial<Props>) =>
      view.rerender(<FeatureDocumentPage {...all} {...next} />),
  };
}
const body = () => screen.getByRole("textbox", { name: "Body" });
const titleField = () =>
  screen.getByRole("textbox", {
    name: "tasks:features.workspace.documentTitle",
  });
const type = (value: string) => fireEvent.change(body(), { target: { value } });
async function flush() {
  let saved: boolean | undefined;
  await act(async () => {
    saved = await m.guard?.flush?.();
  });
  return saved;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.update.mockReset();
  m.prune.mockResolvedValue({ deletedAssetIds: [] });
  m.canEdit = true;
  m.guard = undefined;
  m.editor = undefined;
});
afterEach(cleanup);

describe("Feature document page", () => {
  it("opens full screen ready to edit and returns with All documents or Escape", () => {
    const onBack = vi.fn();
    renderPage({ onBack });
    const dialog = screen.getByRole("dialog", { name: "Design" });
    expect(titleField()).toHaveValue("Design");
    expect(body()).toHaveValue("Original");
    expect(m.editor).toMatchObject({
      variant: "page",
      documentKey: "document",
      readOnly: false,
      disabled: false,
      expandable: false,
      placeholder: "common:documentEditor.slashHint",
    });
    for (const name of [
      "common:documentEditor.edit",
      "common:documentEditor.save",
      "common:actions.cancel",
    ])
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:features.workspace.allDocuments",
      }),
    );
    expect(onBack).toHaveBeenCalledOnce();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("saves through the leave guard and keeps typing made during a save", async () => {
    const answer = deferred<FeatureDocument>();
    m.update
      .mockReturnValueOnce(answer.promise)
      .mockResolvedValueOnce({ ...original, body: "Draft, more", revision: 3 });
    renderPage();
    type("Draft");
    expect(m.guard).toMatchObject({ dirty: true, saving: false });
    expect(
      screen.getByText("common:documentEditor.saving"),
    ).toBeInTheDocument();
    let saving: Promise<boolean | undefined> | undefined;
    act(() => {
      saving = m.guard?.flush?.();
    });
    await waitFor(() =>
      expect(m.update).toHaveBeenCalledWith("feature", "document", {
        body: "Draft",
        expectedRevision: 1,
        keepRemovedAssets: true,
      }),
    );
    type("Draft, more");
    // An upload in progress never locks the text.
    act(() => m.editor?.onPendingUploadChange?.(true));
    expect(body()).toHaveValue("Draft, more");
    expect(body()).toBeEnabled();
    expect(m.guard?.saving).toBe(true);
    act(() => m.editor?.onPendingUploadChange?.(false));
    await act(async () => {
      answer.resolve({ ...original, body: "Draft", revision: 2 });
      await saving;
    });
    expect(body()).toHaveValue("Draft, more");
    expect(await flush()).toBe(true);
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
      body: "Draft, more",
      expectedRevision: 2,
      keepRemovedAssets: true,
    });
    expect(body()).toHaveValue("Draft, more");
    expect(
      screen.getByText("tasks:features.workspace.documentSaved"),
    ).toBeInTheDocument();
    expect(m.guard?.dirty).toBe(false);
  });

  it("announces a failed save and retries it", async () => {
    m.update
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...original, body: "Draft", revision: 2 });
    renderPage();
    type("Draft");
    expect(await flush()).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:features.workspace.documentSaveFailed",
    );
    expect(body()).toHaveValue("Draft");
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("tasks:features.workspace.documentSaved"),
      ).toBeInTheDocument(),
    );
    expect(m.update).toHaveBeenCalledTimes(2);
  });

  it("prunes removed uploads through the leave guard before signing out", async () => {
    const start = { ...original, body: "![a](/api/asset/a)" };
    m.update.mockResolvedValueOnce({ ...start, body: "", revision: 2 });
    renderPage({ document: start });
    type("");
    expect(await flush()).toBe(true);
    await act(async () => {
      await m.guard?.finish?.();
    });
    expect(m.prune).toHaveBeenCalledWith("feature", ["a"]);
  });

  it("shows people who cannot edit a heading and the text only", () => {
    m.canEdit = false;
    renderPage({ document: { ...original, body: "" } });
    expect(
      screen.getByRole("heading", { level: 1, name: "Design" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(m.editor).toMatchObject({
      readOnly: true,
      placeholder: "tasks:features.workspace.emptyDocument",
      uploadAsset: undefined,
    });
    expect(
      screen.queryByRole("button", {
        name: "tasks:features.workspace.deleteDocument",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("common:documentEditor.saving"),
    ).not.toBeInTheDocument();
  });

  it("keeps the text and explains when edit permission is lost", () => {
    const { rerender } = renderPage();
    type("Copy me");
    m.canEdit = false;
    rerender({});
    expect(screen.getByRole("alert")).toHaveTextContent(
      "common:documentEditor.permissionLost",
    );
    expect(screen.getByText("Read Copy me")).toBeInTheDocument();
  });

  it("selects a new document's title and moves into the body on Enter", () => {
    renderPage({ focusTitle: true });
    expect(titleField()).toHaveFocus();
    fireEvent.keyDown(titleField(), { key: "Enter" });
    expect(m.focus).toHaveBeenCalledWith("start");
  });

  it("restores a cleared title on blur and never saves it blank", async () => {
    renderPage();
    fireEvent.change(titleField(), { target: { value: "  " } });
    expect(screen.getByRole("dialog", { name: "Design" })).toBeInTheDocument();
    fireEvent.blur(titleField());
    expect(titleField()).toHaveValue("Design");
    expect(await flush()).toBe(true);
    expect(m.update).not.toHaveBeenCalled();
  });

  describe("when someone else saved first", () => {
    const theirs = { ...original, body: "Theirs", revision: 2 };

    async function conflicted() {
      m.update.mockRejectedValueOnce(
        new HttpError(409, "Changed", { code: "DOCUMENT_CONFLICT" }),
      );
      const view = renderPage();
      type("Mine");
      expect(await flush()).toBe(false);
      expect(view.props.refresh).toHaveBeenCalledOnce();
      view.rerender({ document: theirs });
      fireEvent.click(
        screen.getByRole("button", {
          name: "common:documentEditor.reviewLatest",
        }),
      );
      expect(screen.getByText("Read Theirs")).toBeInTheDocument();
      return view;
    }

    it("saves my text on top of theirs with Keep my draft", async () => {
      await conflicted();
      m.update.mockResolvedValueOnce({ ...theirs, body: "Mine", revision: 3 });
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", {
            name: "common:documentEditor.keepDraft",
          }),
        ),
      );
      expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
        body: "Mine",
        expectedRevision: 2,
        keepRemovedAssets: true,
      });
      expect(
        screen.queryByText("common:documentEditor.conflict"),
      ).not.toBeInTheDocument();
    });

    it("replaces my text with theirs with Use saved version", async () => {
      await conflicted();
      fireEvent.click(
        screen.getByRole("button", { name: "common:documentEditor.useLatest" }),
      );
      expect(body()).toHaveValue("Theirs");
      expect(m.update).toHaveBeenCalledOnce();
    });
  });

  it("discards the draft and returns only after the deletion finishes", async () => {
    const done = deferred<void>();
    m.remove.mockReturnValue(done.promise);
    const onBack = vi.fn(() => expect(m.guard?.saving).toBe(false));
    renderPage({ onBack });
    type("Unsaved");
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:features.workspace.deleteDocument",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(m.guard?.saving).toBe(true));
    expect(m.editor?.disabled).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => done.resolve());
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(m.guard?.dirty).toBe(false);
    expect(await flush()).toBe(true);
    expect(m.update).not.toHaveBeenCalled();
  });
});
