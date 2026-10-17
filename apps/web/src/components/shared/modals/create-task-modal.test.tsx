import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

import CreateTaskModal from "./create-task-modal";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const useLocation = vi.fn();
const deleteTask = vi.fn(async () => {});
const updateTask = vi.fn(async (input: Record<string, unknown>) => input);
const setProject = vi.fn();
let workspaceId = "workspace-1";
let projects: { id: string; name: string; slug: string }[] | undefined;
let columnsError = false;
let columnsFetching = false;
const refetchColumns = vi.fn();
let projectColumns:
  | { id: string; slug: string; name: string; isFinal: boolean }[]
  | undefined;
let storedProject: { id: string; columns: unknown[] } | null = null;
let uploadAsset: ((file: File) => Promise<unknown>) | undefined;
const stageUpload = vi.fn();
let customFieldDefs: unknown[] | undefined;
let projectFeatures:
  | { id: string; title: string; number: number | null; status: string }[]
  | undefined;
vi.mock("@/lib/upload-draft-asset", () => ({
  uploadDraftAsset: (...args: unknown[]) => stageUpload(...args),
}));

beforeEach(() => {
  workspaceId = "workspace-1";
  projects = [
    { id: "project-1", name: "Alpha", slug: "alp" },
    { id: "project-2", name: "Beta", slug: "bet" },
  ];
  storedProject = null;
  setProject.mockReset();
  customFieldDefs = undefined;
  projectFeatures = [
    { id: "checkout", title: "Checkout", number: 3, status: "to-do" },
  ];
  columnsError = false;
  columnsFetching = false;
  refetchColumns.mockImplementation(async () => ({
    data: projectColumns,
    isError: columnsError,
  }));
  projectColumns = [
    { id: "todo", slug: "to-do", name: "To Do", isFinal: false },
  ];
  useLocation.mockReturnValue({ pathname: "/dashboard/workspace/workspace-1" });
});
const createTask = vi.fn(async (input: Record<string, unknown>) => ({
  id: input.type === "feature" ? "feature-1" : "task-1",
  title: input.title,
  status: input.status,
  projectId: input.projectId,
  createdAt: "2026-08-05T00:00:00.000Z",
}));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => useLocation(),
  useParams: ({
    select,
  }: {
    select: (params: { workspaceId?: string }) => unknown;
  }) =>
    select({
      workspaceId: useLocation().pathname.match(/\/workspace\/([^/]+)/)?.[1],
    }),
}));

vi.mock("@/components/task/task-description-editor", () => ({
  default: (props: {
    taskId?: string;
    uploadAsset: (file: File) => Promise<unknown>;
    onChange: (value: string) => void;
  }) => {
    uploadAsset = props.uploadAsset;
    return (
      <textarea
        data-testid="description-editor"
        data-task-id={props.taskId}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  },
}));

vi.mock("@/hooks/mutations/label/use-create-label", () => ({
  default: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-create-task", () => ({
  default: () => ({ mutateAsync: createTask }),
}));

vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: deleteTask }),
}));

vi.mock("@/hooks/mutations/task/use-update-task", () => ({
  useUpdateTask: () => ({ mutateAsync: updateTask }),
}));

vi.mock("@/hooks/queries/label/use-get-labels-by-workspace", () => ({
  default: () => ({ data: [] }),
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: workspaceId, name: "WS" } }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);

vi.mock("@/hooks/queries/workspace-users/use-get-project-members", () => ({
  default: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => true,
    canCreateLabels: () => true,
  }),
}));

vi.mock("@/hooks/queries/column/use-get-columns", () => ({
  useGetColumns: () => ({
    data: projectColumns,
    isError: columnsError,
    isFetching: columnsFetching,
    refetch: refetchColumns,
  }),
}));

vi.mock(
  "@/hooks/queries/custom-field/use-get-custom-fields-by-project",
  () => ({
    default: () => ({ data: customFieldDefs }),
  }),
);

vi.mock("@/hooks/queries/task/use-get-project-features", () => ({
  useGetProjectFeatures: () => ({
    data: projectFeatures,
    isPending: projectFeatures === undefined,
  }),
}));

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: projects }),
}));

vi.mock("@/store/project", () => {
  const state = () => ({ project: storedProject, setProject });
  return { default: Object.assign(state, { getState: state }) };
});

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

describe("CreateTaskModal", () => {
  it("keeps unsaved input while discard confirmation is open", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/workspace/workspace-1/project/project-1/board",
    });
    const onClose = vi.fn();

    render(<CreateTaskModal open onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    const titleInput = screen.getByPlaceholderText(
      "common:modals.createTask.taskTitlePlaceholder",
    );
    fireEvent.change(titleInput, { target: { value: "Unsaved task" } });

    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.pointerUp(backdrop as Element);
    fireEvent.click(backdrop as Element);

    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByText("common:modals.createTask.discardTitle"),
    ).toBeTruthy();
    expect(titleInput).toHaveValue("Unsaved task");

    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });

    expect(createTask).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes after the user confirms discarding unsaved input", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/workspace/workspace-1/project/project-1/board",
    });
    const onClose = vi.fn();

    render(<CreateTaskModal open onClose={onClose} />, {
      wrapper: createWrapper(),
    });

    fireEvent.change(
      screen.getByPlaceholderText(
        "common:modals.createTask.taskTitlePlaceholder",
      ),
      {
        target: { value: "Unsaved task" },
      },
    );
    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]');
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.pointerUp(backdrop as Element);
    fireEvent.click(backdrop as Element);

    await screen.findByText("common:modals.createTask.discardTitle");

    fireEvent.click(screen.getByText("common:modals.createTask.discardButton"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("treats a selected project as unsaved input", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/workspace/workspace-1",
    });

    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText("common:modals.createTask.selectProject"));
    fireEvent.click(await screen.findByText("Beta"));
    const backdrop = document.querySelector('[data-slot="dialog-backdrop"]');
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.pointerUp(backdrop as Element);
    fireEvent.click(backdrop as Element);

    expect(
      await screen.findByText("common:modals.createTask.discardTitle"),
    ).toBeTruthy();
  });

  it("shows a project picker and creates the task in the chosen project", async () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/workspace/workspace-1",
    });

    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    const pickerTrigger = screen.getByText(
      "common:modals.createTask.selectProject",
    );
    fireEvent.click(pickerTrigger);
    fireEvent.click(await screen.findByText("Beta"));

    fireEvent.change(
      screen.getByPlaceholderText(
        "common:modals.createTask.taskTitlePlaceholder",
      ),
      {
        target: { value: "Picked project task" },
      },
    );
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

    await vi.waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Picked project task",
          projectId: "project-2",
        }),
      );
    });
  });

  it("creates Home tasks in the first open custom column and shows its name", async () => {
    projectColumns = [
      { id: "done", slug: "done", name: "Finished", isFinal: true },
      {
        id: "ready",
        slug: "ready-for-work",
        name: "Ready for work",
        isFinal: false,
      },
    ];
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    expect(screen.getByText("Ready for work")).toBeInTheDocument();
    enterTitle();
    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ready-for-work" }),
      ),
    );
  });

  it("waits for the chosen project's columns before submitting", async () => {
    projectColumns = undefined;
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    expect(
      screen.getByText("common:modals.createTask.createButton"),
    ).toBeDisabled();
    submit();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("uses fresh workflow columns when a cached open column became final", async () => {
    refetchColumns.mockResolvedValue({
      data: [
        { id: "todo", slug: "to-do", name: "Completed", isFinal: true },
        { id: "ready", slug: "ready", name: "Ready", isFinal: false },
      ],
      isError: false,
    });
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ready" }),
      ),
    );
  });

  it("does not create from cached columns when the submission refresh fails", async () => {
    refetchColumns.mockResolvedValue({ data: projectColumns, isError: true });
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    submit();
    await vi.waitFor(() => expect(refetchColumns).toHaveBeenCalledOnce());
    expect(createTask).not.toHaveBeenCalled();
  });

  it("waits for refreshing cached workflow columns", async () => {
    columnsFetching = true;
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    expect(
      screen.getByText("common:modals.createTask.createButton"),
    ).toBeDisabled();
    submit();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("does not publish after closing during workflow verification", async () => {
    let finish!: (value: unknown) => void;
    refetchColumns.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    submit();
    view.rerender(<CreateTaskModal open={false} onClose={vi.fn()} />);
    await act(async () => {
      finish({ data: projectColumns, isError: false });
    });
    expect(createTask).not.toHaveBeenCalled();
  });

  it("offers a retry when project statuses could not be loaded", async () => {
    projectColumns = undefined;
    columnsError = true;
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "common:modals.createTask.statusLoadError",
    );
    fireEvent.click(screen.getByText("common:error.tryAgain"));
    expect(refetchColumns).toHaveBeenCalledOnce();
    submit();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("uses planned instead of an ambiguous open/final status slug", async () => {
    projectColumns = [
      { id: "done", slug: "shared", name: "Finished", isFinal: true },
      { id: "open", slug: "shared", name: "Open", isFinal: false },
    ];
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ status: "planned" }),
      ),
    );
  });

  it("uses planned when every column is final", async () => {
    projectColumns = [
      { id: "done", slug: "done", name: "Finished", isFinal: true },
    ];
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ status: "planned" }),
      ),
    );
  });

  it("keeps an explicit planned status even when the project has custom columns", async () => {
    projectColumns = [
      { id: "ready", slug: "ready", name: "Ready", isFinal: false },
    ];
    render(<CreateTaskModal open status="planned" onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ status: "planned" }),
      ),
    );
  });

  it("hides the picker when a project is in scope from the route", () => {
    useLocation.mockReturnValue({
      pathname: "/dashboard/workspace/workspace-1/project/project-1/board",
    });

    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.queryByText("common:modals.createTask.selectProject"),
    ).toBeNull();
  });
});

function enterTitle(title = "Private task") {
  fireEvent.change(
    screen.getByPlaceholderText(
      "common:modals.createTask.taskTitlePlaceholder",
    ),
    {
      target: { value: title },
    },
  );
}

async function chooseBeta() {
  fireEvent.click(screen.getByText("common:modals.createTask.selectProject"));
  fireEvent.click(await screen.findByText("Beta"));
}

function submit() {
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
}

describe("CreateTaskModal context isolation", () => {
  it("never falls back to the last globally visited project", () => {
    storedProject = { id: "foreign-project", columns: [] };
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    enterTitle();
    expect(
      screen.getByText("common:modals.createTask.createButton"),
    ).toBeDisabled();
    submit();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("clears selected project and private fields after close and reopen", async () => {
    const props = { open: true, onClose: vi.fn() };
    const view = render(<CreateTaskModal {...props} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    view.rerender(<CreateTaskModal {...props} open={false} />);
    view.rerender(<CreateTaskModal {...props} />);
    expect(
      screen.getByPlaceholderText(
        "common:modals.createTask.taskTitlePlaceholder",
      ),
    ).toHaveValue("");
    enterTitle("New task");
    submit();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("clears workspace A's selection when workspace B becomes active", async () => {
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    workspaceId = "workspace-2";
    projects = [{ id: "project-3", name: "Gamma", slug: "gam" }];
    useLocation.mockReturnValue({
      pathname: "/dashboard/workspace/workspace-2",
    });
    view.rerender(<CreateTaskModal open onClose={vi.fn()} />);
    enterTitle("Workspace B secret");
    submit();
    expect(createTask).not.toHaveBeenCalled();
    expect(
      screen.getByText("common:modals.createTask.selectProject"),
    ).toBeInTheDocument();
  });

  it("does not expose the previous workspace while the route's workspace is loading", async () => {
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    useLocation.mockReturnValue({
      pathname: "/dashboard/workspace/workspace-2",
    });
    view.rerender(<CreateTaskModal open onClose={vi.fn()} />);
    expect(screen.queryByTestId("description-editor")).toBeNull();
    expect(createTask).not.toHaveBeenCalled();
  });

  it.each([undefined, []])(
    "rejects explicit project IDs until current workspace query proves membership (%s)",
    async (data) => {
      projects = data;
      render(<CreateTaskModal open projectId="project-2" onClose={vi.fn()} />, {
        wrapper: createWrapper(),
      });
      enterTitle();
      submit();
      await expect(uploadAsset?.(new File(["x"], "x.png"))).rejects.toThrow();
      expect(createTask).not.toHaveBeenCalled();
    },
  );

  it("stages attachments without creating a task and claims them only on submit", async () => {
    stageUpload.mockResolvedValue({
      id: "staged-1",
      url: "/asset/staged-1",
      kind: "image",
    });
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    await act(async () => {
      await uploadAsset?.(new File(["x"], "x.png"));
    });
    expect(createTask).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("description-editor"), {
      target: { value: "![image](/asset/staged-1)" },
    });
    submit();
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        draftAssetIds: ["staged-1"],
        projectId: "project-2",
      }),
    );
  });

  it("does not submit while attachments are uploading", async () => {
    let finish!: (value: unknown) => void;
    stageUpload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    enterTitle();
    let pending!: Promise<unknown>;
    act(() => {
      pending = uploadAsset!(new File(["x"], "x.png"));
    });
    expect(
      screen.getByText("activity:comment.editor.uploadingFile"),
    ).toBeDisabled();
    submit();
    expect(createTask).not.toHaveBeenCalled();
    await act(async () => {
      finish({ id: "staged-2" });
      await pending;
    });
    submit();
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
  });

  it("closing after an upload creates no published task or deletion side effect", async () => {
    stageUpload.mockResolvedValue({ id: "staged-1" });
    const view = render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await act(async () => {
      await uploadAsset?.(new File(["x"], "x.png"));
    });
    view.rerender(<CreateTaskModal open={false} onClose={vi.fn()} />);
    expect(createTask).not.toHaveBeenCalled();
    expect(deleteTask).not.toHaveBeenCalled();
    expect(setProject).not.toHaveBeenCalled();
  });
});

const customField = (
  id: string,
  type: string,
  required: boolean,
  defaultValue: string | null = null,
) => ({
  id,
  projectId: "project-2",
  name: id,
  type,
  required,
  defaultValue,
  options: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
});

describe("CreateTaskModal custom fields", () => {
  it("flags empty required fields instead of creating, then sends the filled values", async () => {
    customFieldDefs = [
      customField("customer", "text", true),
      customField("billable", "boolean", true, "false"),
      customField("points", "number", false),
    ];
    render(<CreateTaskModal open onClose={vi.fn()} projectId="project-2" />, {
      wrapper: createWrapper(),
    });
    enterTitle();
    submit();

    expect(
      await screen.findByText("tasks:customFields.missingRequired"),
    ).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
    const customerChip = document.querySelector(
      '[data-custom-field="customer"]',
    ) as HTMLElement;
    expect(document.activeElement).toBe(customerChip);

    fireEvent.click(customerChip);
    const input = await screen.findByLabelText("customer");
    fireEvent.change(input, { target: { value: "Acme Corp" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await vi.waitFor(() =>
      expect(
        screen.queryByText("tasks:customFields.missingRequired"),
      ).not.toBeInTheDocument(),
    );
    submit();
    await vi.waitFor(() =>
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          customFields: [
            { fieldId: "customer", value: "Acme Corp" },
            { fieldId: "billable", value: "false" },
          ],
        }),
      ),
    );
  });
});

const featureChip = (name = "common:modals.createTask.feature") =>
  screen.getByRole("button", { name });

async function openFeaturePicker(name?: string) {
  fireEvent.click(featureChip(name));
  return screen.findByPlaceholderText(
    "common:modals.createTask.searchFeatures",
  );
}

async function pickFeature(option: RegExp) {
  await openFeaturePicker();
  await act(async () => {
    fireEvent.click(await screen.findByRole("option", { name: option }));
  });
}

async function chooseNewFeature(title: string) {
  const search = await openFeaturePicker();
  fireEvent.change(search, { target: { value: title } });
  await act(async () => {
    fireEvent.click(
      await screen.findByRole("option", {
        name: /common:modals.createTask.createFeature/,
      }),
    );
  });
}

const sentRequests = () =>
  createTask.mock.calls.map(([input]) => ({
    title: input.title,
    type: input.type,
    featureId: input.featureId,
  }));

describe("CreateTaskModal features", () => {
  it("creates a feature, in the feature's words, without a feature of its own", async () => {
    const { toast } = await import("@/lib/toast");
    render(<CreateTaskModal open type="feature" onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();

    expect(
      screen.getByText("common:modals.createTask.titleFeature"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("common:modals.createTask.createButtonFeature"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "common:modals.createTask.feature",
      }),
    ).toBeNull();
    fireEvent.change(
      screen.getByPlaceholderText(
        "common:modals.createTask.featureTitlePlaceholder",
      ),
      { target: { value: "Checkout v2" } },
    );
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-2", type: "feature" }),
    );
    expect(sentRequests()).toEqual([
      { title: "Checkout v2", type: "feature", featureId: undefined },
    ]);
    expect(toast.success).toHaveBeenCalledWith(
      "common:modals.createTask.successCreatedFeature",
      expect.anything(),
    );
  });

  it("switches a task to a feature with the Type chip", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await pickFeature(/Checkout/);

    fireEvent.click(
      screen.getByRole("button", {
        name: "common:modals.createTask.type common:modals.createTask.typeTask",
      }),
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", {
        name: /common:modals.createTask.typeFeature/,
      }),
    );

    expect(
      await screen.findByPlaceholderText(
        "common:modals.createTask.featureTitlePlaceholder",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "common:modals.createTask.feature Checkout",
      }),
    ).toBeNull();
    fireEvent.change(
      screen.getByPlaceholderText(
        "common:modals.createTask.featureTitlePlaceholder",
      ),
      { target: { value: "Payments" } },
    );
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    expect(sentRequests()).toEqual([
      { title: "Payments", type: "feature", featureId: undefined },
    ]);
  });

  it("explains that a project comes first", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(featureChip());

    expect(
      await screen.findByText(
        "common:modals.createTask.chooseProjectForFeature",
      ),
    ).toBeInTheDocument();
  });

  it("creates the task in the picked feature", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await pickFeature(/Checkout/);

    expect(
      featureChip("common:modals.createTask.feature Checkout"),
    ).toBeInTheDocument();
    enterTitle("Card form");
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    expect(sentRequests()).toEqual([
      { title: "Card form", type: "task", featureId: "checkout" },
    ]);
  });

  it("creates a new feature first, then the task in it", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");

    expect(
      featureChip(
        "common:modals.createTask.feature common:modals.createTask.newFeatureSuffix",
      ),
    ).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
    enterTitle("Card form");
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(2));
    expect(sentRequests()).toEqual([
      { title: "Payments", type: "feature", featureId: undefined },
      { title: "Card form", type: "task", featureId: "feature-1" },
    ]);
    expect(createTask.mock.calls[0][0]).toMatchObject({
      projectId: "project-2",
      status: "to-do",
      description: "",
    });
  });

  it("creates nothing for a new feature when the dialog is discarded", async () => {
    const onClose = vi.fn();
    render(<CreateTaskModal open onClose={onClose} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");
    enterTitle("Card form");

    fireEvent.click(screen.getByText("common:actions.cancel"));
    fireEvent.click(
      await screen.findByText("common:modals.createTask.discardButton"),
    );

    expect(onClose).toHaveBeenCalledOnce();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("clears the feature when the project changes", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await pickFeature(/Checkout/);

    fireEvent.click(screen.getByText("Beta"));
    fireEvent.click(await screen.findByText("Alpha"));

    expect(featureChip()).toBeInTheDocument();
    enterTitle("Card form");
    submit();
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    expect(sentRequests()).toEqual([
      { title: "Card form", type: "task", featureId: undefined },
    ]);
  });

  it("retries a failed task in the feature it already created", async () => {
    const { toast } = await import("@/lib/toast");
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");
    enterTitle("Card form");
    createTask.mockImplementationOnce(async (input) => ({
      id: "feature-1",
      title: input.title,
      status: input.status,
      projectId: input.projectId,
      createdAt: "2026-08-05T00:00:00.000Z",
    }));
    createTask.mockRejectedValueOnce(new Error("Task failed"));

    submit();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Task failed"),
    );
    expect(
      featureChip("common:modals.createTask.feature Payments"),
    ).toBeInTheDocument();
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(3));
    expect(sentRequests()).toEqual([
      { title: "Payments", type: "feature", featureId: undefined },
      { title: "Card form", type: "task", featureId: "feature-1" },
      { title: "Card form", type: "task", featureId: "feature-1" },
    ]);
  });

  it("keeps creating features with Create more", async () => {
    render(<CreateTaskModal open type="feature" onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    fireEvent.click(
      screen.getByLabelText("common:modals.createTask.createMore"),
    );
    const title = screen.getByPlaceholderText(
      "common:modals.createTask.featureTitlePlaceholder",
    );
    fireEvent.change(title, { target: { value: "Payments" } });
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(title).toHaveValue(""));
    expect(
      screen.getByPlaceholderText(
        "common:modals.createTask.featureTitlePlaceholder",
      ),
    ).toBe(title);
  });

  it("keeps the type and the feature for the next one with Create more", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");
    fireEvent.click(
      screen.getByLabelText("common:modals.createTask.createMore"),
    );
    enterTitle("Card form");
    submit();
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(2));

    await vi.waitFor(() =>
      expect(
        screen.getByPlaceholderText(
          "common:modals.createTask.taskTitlePlaceholder",
        ),
      ).toHaveValue(""),
    );
    expect(
      featureChip("common:modals.createTask.feature Payments"),
    ).toBeInTheDocument();
    enterTitle("Card errors");
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(3));
    expect(sentRequests()[2]).toEqual({
      title: "Card errors",
      type: "task",
      featureId: "feature-1",
    });
  });
});

async function chooseType(option: RegExp) {
  fireEvent.click(
    screen.getByRole("button", { name: /^common:modals.createTask.type / }),
  );
  fireEvent.click(await screen.findByRole("menuitemradio", { name: option }));
}

const featureCreated = (input: Record<string, unknown>) => ({
  id: "feature-1",
  title: input.title,
  status: input.status,
  projectId: input.projectId,
  createdAt: "2026-08-05T00:00:00.000Z",
});

describe("CreateTaskModal new features", () => {
  it("creates only the feature once the Type chip makes it a feature", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");

    await chooseType(/common:modals.createTask.typeFeature/);
    fireEvent.change(
      await screen.findByPlaceholderText(
        "common:modals.createTask.featureTitlePlaceholder",
      ),
      { target: { value: "Checkout v2" } },
    );
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    expect(sentRequests()).toEqual([
      { title: "Checkout v2", type: "feature", featureId: undefined },
    ]);
  });

  it("gives the new feature only its title, not the task's details", async () => {
    render(
      <CreateTaskModal
        open
        projectId="project-2"
        status="in-progress"
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    await chooseNewFeature("Payments");
    enterTitle("Card form");
    fireEvent.change(screen.getByTestId("description-editor"), {
      target: { value: "Task notes" },
    });
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(2));
    expect(createTask.mock.calls[0][0]).toMatchObject({
      title: "Payments",
      type: "feature",
      projectId: "project-2",
      status: "in-progress",
      description: "",
      userId: "",
      priority: "no-priority",
    });
    expect(createTask.mock.calls[0][0]).not.toHaveProperty("featureId");
    expect(createTask.mock.calls[1][0]).toMatchObject({
      title: "Card form",
      type: "task",
      featureId: "feature-1",
      status: "in-progress",
      description: "Task notes",
    });
  });

  it("gives the new feature the project's required custom fields", async () => {
    customFieldDefs = [
      customField("customer", "text", true),
      customField("points", "number", false),
    ];
    render(<CreateTaskModal open onClose={vi.fn()} projectId="project-2" />, {
      wrapper: createWrapper(),
    });
    enterTitle("Card form");
    for (const [id, value] of [
      ["customer", "Acme Corp"],
      ["points", "3"],
    ]) {
      fireEvent.click(
        document.querySelector(`[data-custom-field="${id}"]`) as HTMLElement,
      );
      const input = await screen.findByLabelText(id);
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    await chooseNewFeature("Payments");
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(2));
    // A project requires its required fields of features too; the rest stay
    // the task's own.
    expect(createTask.mock.calls[0][0]).toMatchObject({
      type: "feature",
      customFields: [{ fieldId: "customer", value: "Acme Corp" }],
    });
    expect(createTask.mock.calls[1][0]).toMatchObject({
      type: "task",
      customFields: [
        { fieldId: "customer", value: "Acme Corp" },
        { fieldId: "points", value: "3" },
      ],
    });
  });

  it("lets a new feature's name start with a digit", async () => {
    render(<CreateTaskModal open onClose={vi.fn()} projectId="project-2" />, {
      wrapper: createWrapper(),
    });
    const search = await openFeaturePicker();

    fireEvent.keyDown(search, { key: "2" });
    fireEvent.change(search, { target: { value: "2FA" } });

    expect(
      await screen.findByRole("option", {
        name: /common:modals\.createTask\.createFeature/,
      }),
    ).toBeInTheDocument();
    expect(featureChip()).toBeInTheDocument();
  });

  it("creates the new feature once when submitted twice", async () => {
    let finishFeature!: () => void;
    createTask.mockImplementationOnce(
      (input) =>
        new Promise((resolve) => {
          finishFeature = () => resolve(featureCreated(input));
        }),
    );
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");
    enterTitle("Card form");

    submit();
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledOnce());
    submit();
    fireEvent.keyDown(document, { key: "Enter", metaKey: true });
    await act(async () => finishFeature());

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(sentRequests()).toEqual([
      { title: "Payments", type: "feature", featureId: undefined },
      { title: "Card form", type: "task", featureId: "feature-1" },
    ]);
  });

  it("creates no task when the new feature fails, and tries the feature again", async () => {
    const { toast } = await import("@/lib/toast");
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");
    enterTitle("Card form");
    createTask.mockRejectedValueOnce(new Error("Feature failed"));

    submit();

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Feature failed"),
    );
    expect(createTask).toHaveBeenCalledOnce();
    expect(
      featureChip(
        "common:modals.createTask.feature common:modals.createTask.newFeatureSuffix",
      ),
    ).toBeInTheDocument();
    submit();

    await vi.waitFor(() => expect(createTask).toHaveBeenCalledTimes(3));
    expect(sentRequests()).toEqual([
      { title: "Payments", type: "feature", featureId: undefined },
      { title: "Payments", type: "feature", featureId: undefined },
      { title: "Card form", type: "task", featureId: "feature-1" },
    ]);
  });

  it("keeps the new feature on the open board when its task joins it", async () => {
    storedProject = { id: "project-2", columns: [{ id: "to-do", tasks: [] }] };
    setProject.mockImplementation((next) => {
      storedProject = next;
    });
    render(<CreateTaskModal open onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    await chooseBeta();
    await chooseNewFeature("Payments");
    enterTitle("Card form");
    submit();

    await vi.waitFor(() => expect(setProject).toHaveBeenCalledTimes(2));
    const board = storedProject as unknown as {
      columns: { tasks: { id: string; featureId?: string }[] }[];
    };
    expect(board.columns[0].tasks.map(({ id }) => id)).toEqual([
      "feature-1",
      "task-1",
    ]);
  });

  it("asks to discard a feature in the feature's words", async () => {
    render(<CreateTaskModal open type="feature" onClose={vi.fn()} />, {
      wrapper: createWrapper(),
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "common:modals.createTask.featureTitlePlaceholder",
      ),
      { target: { value: "Payments" } },
    );

    fireEvent.click(screen.getByText("common:actions.cancel"));

    expect(
      await screen.findByText("common:modals.createTask.discardTitleFeature"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("common:modals.createTask.discardDescriptionFeature"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("common:modals.createTask.discardButtonFeature"),
    ).toBeInTheDocument();
  });
});
