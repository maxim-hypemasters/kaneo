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
import type { FeatureHealth } from "@/fetchers/feature/types";
import { FeatureUpdateComposer } from "./feature-update-composer";

const m = vi.hoisted(() => ({
  publish: vi.fn(),
  canEdit: true,
  guard: { dirty: false, saving: false },
}));
vi.mock("@/fetchers/feature/feature-workspace", () => ({
  publishFeatureUpdate: m.publish,
}));
vi.mock("@/hooks/queries/feature/use-feature-workspace", () => ({
  featureWorkspaceKey: (project: string, feature: string) => [
    "feature-workspace",
    project,
    feature,
  ],
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => m.canEdit }),
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
    footer,
  }: DocumentEditorProps) => (
    <div>
      <textarea
        aria-label="Update note"
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {footer}
    </div>
  ),
}));
vi.mock("./feature-health-select", () => ({
  FeatureHealthSelect: ({
    value,
    disabled,
    onChange,
  }: {
    value: FeatureHealth | null;
    disabled?: boolean;
    onChange: (value: FeatureHealth) => void;
  }) => (
    <select
      aria-label="Health"
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as FeatureHealth)}
    >
      <option value="">Choose health</option>
      <option value="on-track">On track</option>
      <option value="at-risk">At risk</option>
    </select>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <FeatureUpdateComposer featureId="feature" projectId="project" />,
    { wrapper },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.canEdit = true;
  m.guard = { dirty: false, saving: false };
});
afterEach(cleanup);

describe("Feature update composer", () => {
  it("defaults to On track, requires a note, and resets after publication", async () => {
    m.publish.mockResolvedValue({ id: "report" });
    setup();
    const publish = screen.getByRole("button", {
      name: "tasks:features.workspace.publishUpdate",
    });
    expect(publish).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Health" })).toHaveValue(
      "on-track",
    );
    expect(m.guard.dirty).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Update note" }), {
      target: { value: "All good" },
    });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    await waitFor(() =>
      expect(m.publish).toHaveBeenCalledWith("feature", {
        note: "All good",
        health: "on-track",
        draftAssetIds: [],
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Update note" })).toHaveValue(
        "",
      ),
    );
    expect(m.guard.dirty).toBe(false);
    expect(screen.getByRole("combobox", { name: "Health" })).toHaveValue(
      "on-track",
    );
  });

  it("keeps the failed note and health for retry and blocks dismissal during a write", async () => {
    let reject: ((error: Error) => void) | undefined;
    m.publish.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Update note" }), {
      target: { value: "Delayed by tests" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Health" }), {
      target: { value: "at-risk" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:features.workspace.publishUpdate",
      }),
    );
    await waitFor(() => expect(m.guard.saving).toBe(true));
    expect(screen.getByRole("textbox", { name: "Update note" })).toBeDisabled();
    await act(async () => reject?.(new Error("offline")));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "tasks:features.workspace.publishFailed",
      ),
    );
    expect(screen.getByRole("textbox", { name: "Update note" })).toHaveValue(
      "Delayed by tests",
    );
    expect(screen.getByRole("combobox", { name: "Health" })).toHaveValue(
      "at-risk",
    );
    expect(m.guard).toMatchObject({ dirty: true, saving: false });
  });

  it("keeps a copyable draft if editing permission disappears", () => {
    const { rerender } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Update note" }), {
      target: { value: "Keep me" },
    });
    m.canEdit = false;
    rerender(<FeatureUpdateComposer featureId="feature" projectId="project" />);
    expect(screen.getByRole("textbox", { name: "Update note" })).toHaveValue(
      "Keep me",
    );
    expect(
      screen.getByRole("textbox", { name: "Update note" }),
    ).toHaveAttribute("readonly");
    expect(
      screen.getByRole("button", {
        name: "tasks:features.workspace.publishUpdate",
      }),
    ).toBeDisabled();
  });
});
