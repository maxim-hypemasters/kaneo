import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { FeatureDocument } from "@/fetchers/feature/types";
import { HttpError } from "@/lib/http-error";
import { useFeatureDocumentDraft } from "./use-feature-document-draft";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/fetchers/feature/feature-workspace", () => ({
  createFeatureDocument: m.create,
  updateFeatureDocument: m.update,
}));
vi.mock("@/lib/upload-draft-asset", () => ({ uploadDraftAsset: m.upload }));
vi.mock("@/hooks/queries/feature/use-feature-workspace", () => ({
  featureWorkspaceKey: (project: string, feature: string) => [
    "feature-workspace",
    project,
    feature,
  ],
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
function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Feature document drafts", () => {
  it("does not overwrite a newer cached document with a delayed save response", async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    let resolve: ((value: FeatureDocument) => void) | undefined;
    m.update.mockImplementation(
      () =>
        new Promise<FeatureDocument>((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(
      () =>
        useFeatureDocumentDraft({
          projectId: "project",
          featureId: "feature",
          document,
          canEdit: true,
          refresh: vi.fn(),
          onSaved: vi.fn(),
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    act(() => result.current.edit());
    act(() => result.current.change({ body: "My edit" }));
    let saving: Promise<void> | undefined;
    act(() => {
      saving = result.current.save();
    });
    await waitFor(() => expect(m.update).toHaveBeenCalledOnce());
    const key = [
      "feature-workspace",
      "project",
      "feature",
      "document",
      "document",
    ];
    client.setQueryData(key, {
      ...document,
      body: "Newer external edit",
      revision: 3,
    });
    await act(async () => {
      resolve?.({ ...document, body: "My edit", revision: 2 });
      await saving;
    });
    expect(client.getQueryData<FeatureDocument>(key)?.revision).toBe(3);
    expect(client.getQueryData<FeatureDocument>(key)?.body).toBe(
      "Newer external edit",
    );
  });
  it("preserves title/body edits after a failed save and retries with the baseline revision", async () => {
    m.update.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
      ...document,
      body: "Local",
      title: "Renamed",
      revision: 2,
    });
    const { result } = renderHook(
      () =>
        useFeatureDocumentDraft({
          projectId: "project",
          featureId: "feature",
          document,
          canEdit: true,
          refresh: vi.fn(),
          onSaved: vi.fn(),
        }),
      { wrapper: Wrapper },
    );
    act(() => result.current.edit());
    act(() => result.current.change({ body: "Local", title: "Renamed" }));
    await act(() => result.current.save());
    expect(result.current.value).toEqual({ title: "Renamed", body: "Local" });
    expect(result.current.dirty).toBe(true);
    await act(() => result.current.save());
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
      title: "Renamed",
      body: "Local",
      expectedRevision: 1,
      draftAssetIds: [],
    });
    expect(result.current.dirty).toBe(false);
  });

  it("retains a local draft on external refresh, blocks saving, and allows reviewing/rebasing", () => {
    const { result, rerender } = renderHook(
      ({ value }) =>
        useFeatureDocumentDraft({
          projectId: "project",
          featureId: "feature",
          document: value,
          canEdit: true,
          refresh: vi.fn(),
          onSaved: vi.fn(),
        }),
      { wrapper: Wrapper, initialProps: { value: document } },
    );
    act(() => result.current.edit());
    act(() => result.current.change({ body: "Local" }));
    rerender({ value: { ...document, body: "Someone else", revision: 2 } });
    expect(result.current.value.body).toBe("Local");
    expect(result.current.conflict).toBe(true);
    act(() => result.current.keepDraft());
    expect(result.current.conflict).toBe(false);
    expect(result.current.value.body).toBe("Local");
  });

  it("refreshes a server conflict without dropping the draft", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    m.update.mockRejectedValue(
      new HttpError(409, "Changed", { code: "DOCUMENT_CONFLICT" }),
    );
    const { result } = renderHook(
      () =>
        useFeatureDocumentDraft({
          projectId: "project",
          featureId: "feature",
          document,
          canEdit: true,
          refresh,
          onSaved: vi.fn(),
        }),
      { wrapper: Wrapper },
    );
    act(() => result.current.edit());
    act(() => result.current.change({ body: "Local" }));
    await act(() => result.current.save());
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.conflict).toBe(true);
    expect(result.current.value.body).toBe("Local");
  });

  it("claims only referenced staged assets and notifies creation only after the draft is clean", async () => {
    const saved = {
      ...document,
      title: "New",
      body: "![image](/asset/kept)",
      revision: 1,
    };
    m.create.mockResolvedValue(saved);
    m.upload
      .mockResolvedValueOnce({ id: "kept", url: "/asset/kept" })
      .mockResolvedValueOnce({ id: "removed", url: "/asset/removed" });
    const onSaved = vi.fn();
    const { result } = renderHook(
      () =>
        useFeatureDocumentDraft({
          projectId: "project",
          featureId: "feature",
          canEdit: true,
          refresh: vi.fn(),
          onSaved,
        }),
      { wrapper: Wrapper },
    );
    await act(() => result.current.upload(new File(["a"], "a.png")));
    await act(() => result.current.upload(new File(["b"], "b.png")));
    act(() => result.current.change({ title: "New", body: saved.body }));
    await act(() => result.current.save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(result.current.dirty).toBe(false);
    expect(m.create).toHaveBeenCalledWith("feature", {
      title: "New",
      body: saved.body,
      draftAssetIds: ["kept"],
    });
  });

  it("leaves text intact and prevents saving after permission loss", () => {
    const { result, rerender } = renderHook(
      ({ canEdit }) =>
        useFeatureDocumentDraft({
          projectId: "project",
          featureId: "feature",
          document,
          canEdit,
          refresh: vi.fn(),
          onSaved: vi.fn(),
        }),
      { wrapper: Wrapper, initialProps: { canEdit: true } },
    );
    act(() => result.current.edit());
    act(() => result.current.change({ body: "Copyable draft" }));
    rerender({ canEdit: false });
    act(() => {
      void result.current.save();
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(result.current.value.body).toBe("Copyable draft");
  });
});
