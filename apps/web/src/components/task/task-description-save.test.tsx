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
import { HttpError } from "@/lib/http-error";
import TaskDescription from "./task-description";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  upload: vi.fn(),
  canEdit: true,
  tasks: new Map<
    string,
    { id: string; projectId: string; description: string }
  >(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/providers/auth-provider", async () => ({
  AuthContext: (await import("react")).createContext({ user: { id: "owner" } }),
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: (id: string) => ({
    data: mocks.tasks.get(id),
    refetch: mocks.refresh,
  }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-description", () => ({
  useUpdateTaskDescription: () => ({ mutateAsync: mocks.save }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => mocks.canEdit }),
}));
vi.mock("@/lib/upload-draft-asset", () => ({ uploadDraftAsset: mocks.upload }));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftGuard: vi.fn(),
}));
vi.mock("@/components/editor/document-editor", () => ({
  DocumentEditor: ({
    value,
    onChange,
    onRequestEdit,
    readOnly,
    disabled,
    footer,
    notice,
    headerActions,
    uploadAsset,
    onPendingUploadChange,
  }: {
    value: string;
    onChange?: (value: string) => void;
    onRequestEdit?: () => void;
    readOnly?: boolean;
    disabled?: boolean;
    footer?: React.ReactNode;
    notice?: React.ReactNode;
    headerActions?: React.ReactNode;
    uploadAsset?: (file: File) => Promise<unknown>;
    onPendingUploadChange?: (pending: boolean) => void;
  }) => (
    <div>
      {headerActions}
      {notice}
      <textarea
        aria-label="Document"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onClick={() => {
          if (readOnly && !disabled) onRequestEdit?.();
        }}
        readOnly={readOnly}
        disabled={disabled}
      />
      {uploadAsset && (
        <button
          type="button"
          onClick={async () => {
            onPendingUploadChange?.(true);
            try {
              await uploadAsset(
                new File(["image"], "test.png", { type: "image/png" }),
              );
            } finally {
              onPendingUploadChange?.(false);
            }
          }}
        >
          Upload image
        </button>
      )}
      {footer}
    </div>
  ),
}));

function edit(value = "draft") {
  fireEvent.click(screen.getByLabelText("Document"));
  fireEvent.change(screen.getByLabelText("Document"), { target: { value } });
}

beforeEach(() => {
  mocks.tasks.clear();
  mocks.tasks.set("a", { id: "a", projectId: "p", description: "original" });
  mocks.save.mockReset().mockResolvedValue({ description: "saved" });
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.upload.mockReset().mockResolvedValue({
    id: "asset-1",
    url: "/api/asset/asset-1",
    kind: "image",
  });
  mocks.canEdit = true;
});
afterEach(cleanup);

describe("explicit description saves", () => {
  it("clicking the description starts editing without an Edit button", () => {
    render(<TaskDescription taskId="a" />);
    expect(
      screen.queryByText("common:documentEditor.edit"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Document"));

    expect(screen.getByLabelText("Document")).toHaveProperty("readOnly", false);
    expect(screen.getByText("common:documentEditor.save")).toBeInTheDocument();
  });

  it("keeps description clicks read-only without update permission", () => {
    mocks.canEdit = false;
    render(<TaskDescription taskId="a" />);

    fireEvent.click(screen.getByLabelText("Document"));

    expect(screen.getByLabelText("Document")).toHaveProperty("readOnly", true);
    expect(
      screen.queryByText("common:documentEditor.save"),
    ).not.toBeInTheDocument();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("clicking again while editing retains the draft and original snapshot", () => {
    render(<TaskDescription taskId="a" />);
    edit("retained draft");

    fireEvent.click(screen.getByLabelText("Document"));
    fireEvent.click(screen.getByLabelText("Document"));

    expect(screen.getByLabelText("Document")).toHaveProperty(
      "value",
      "retained draft",
    );
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "retained draft",
        expectedDescription: "original",
      }),
    );
  });

  it("keeps a conflict recoverable when loading the saved version fails", async () => {
    mocks.save.mockRejectedValue(
      new HttpError(409, "Changed", { code: "DESCRIPTION_CONFLICT" }),
    );
    mocks.refresh.mockRejectedValueOnce(new Error("offline"));
    render(<TaskDescription taskId="a" />);
    edit();
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    await screen.findByText("common:error.tryAgain");
    expect(
      screen.getByText("common:documentEditor.reviewLatest"),
    ).toBeDisabled();
    expect(screen.getByLabelText("Document")).toHaveProperty("value", "draft");
    fireEvent.click(screen.getByText("common:error.tryAgain"));
    await waitFor(() =>
      expect(
        screen.getByText("common:documentEditor.reviewLatest"),
      ).toBeEnabled(),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("starts read-only and sends the editing snapshot only on Save", async () => {
    render(<TaskDescription taskId="a" />);
    expect(screen.getByLabelText("Document")).toHaveProperty("readOnly", true);
    edit();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        id: "a",
        projectId: "p",
        description: "draft",
        expectedDescription: "original",
        draftAssetIds: [],
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Document")).toHaveProperty(
        "readOnly",
        true,
      ),
    );
  });

  it("Cancel restores saved content and publishes nothing", () => {
    render(<TaskDescription taskId="a" />);
    edit();
    fireEvent.click(screen.getByText("common:actions.cancel"));
    expect(screen.getByLabelText("Document")).toHaveProperty(
      "value",
      "original",
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps the draft after failure and allows retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    render(<TaskDescription taskId="a" />);
    edit();
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    await screen.findByText("common:documentEditor.saveFailed");
    expect(screen.getByLabelText("Document")).toHaveProperty("value", "draft");
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  });

  it("retains local edits on remote refresh until the saved version is reviewed", () => {
    const view = render(<TaskDescription taskId="a" />);
    edit();
    mocks.tasks.set("a", {
      id: "a",
      projectId: "p",
      description: "remote update",
    });
    view.rerender(<TaskDescription taskId="a" />);
    expect(screen.getByLabelText("Document")).toHaveProperty("value", "draft");
    expect(screen.getByText("common:documentEditor.save")).toBeDisabled();
    fireEvent.click(screen.getByText("common:documentEditor.reviewLatest"));
    expect(
      screen
        .getAllByLabelText<HTMLTextAreaElement>("Document")
        .map((element) => element.value),
    ).toContain("remote update");
    fireEvent.click(screen.getByText("common:documentEditor.keepDraft"));
    expect(screen.getByText("common:documentEditor.save")).toBeEnabled();
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "draft",
        expectedDescription: "remote update",
      }),
    );
  });

  it("server conflicts refresh the saved version without discarding the draft", async () => {
    mocks.save.mockRejectedValue(
      new HttpError(409, "Changed", { code: "DESCRIPTION_CONFLICT" }),
    );
    render(<TaskDescription taskId="a" />);
    edit();
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    await screen.findByText("common:documentEditor.conflict");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(screen.getByLabelText("Document")).toHaveProperty("value", "draft");
    expect(screen.getByText("common:documentEditor.save")).toBeDisabled();
  });

  it("keeps a draft visible after permission loss and blocks saving", () => {
    const view = render(<TaskDescription taskId="a" />);
    edit();
    mocks.canEdit = false;
    view.rerender(<TaskDescription taskId="a" />);
    expect(screen.getByLabelText("Document")).toHaveProperty("value", "draft");
    expect(screen.getByLabelText("Document")).toHaveProperty("readOnly", true);
    expect(screen.getByText("common:documentEditor.save")).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("prevents duplicate Save and disables editing while publishing", async () => {
    let finish!: (value: unknown) => void;
    mocks.save.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<TaskDescription taskId="a" />);
    edit();
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    expect(screen.getByText("common:documentEditor.saving")).toBeDisabled();
    expect(screen.getByLabelText("Document")).toBeDisabled();
    expect(screen.getByText("common:actions.cancel")).toBeDisabled();
    await act(async () => finish({ description: "draft" }));
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("claims staged assets only with the description save", async () => {
    render(<TaskDescription taskId="a" />);
    edit("![image](/api/asset/asset-1)");
    fireEvent.click(screen.getByText("Upload image"));
    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith("p", expect.any(File), "a"),
    );
    await waitFor(() =>
      expect(screen.getByText("common:documentEditor.save")).toBeEnabled(),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ draftAssetIds: ["asset-1"] }),
      ),
    );
  });

  it("does not claim uploaded assets removed from the draft", async () => {
    render(<TaskDescription taskId="a" />);
    edit("![image](/api/asset/asset-1)");
    fireEvent.click(screen.getByText("Upload image"));
    await waitFor(() =>
      expect(screen.getByText("common:documentEditor.save")).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Document"), {
      target: { value: "text only" },
    });
    fireEvent.click(screen.getByText("common:documentEditor.save"));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "text only",
          draftAssetIds: [],
        }),
      ),
    );
  });
});
