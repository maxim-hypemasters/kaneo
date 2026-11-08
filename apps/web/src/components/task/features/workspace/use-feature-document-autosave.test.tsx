import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { flushSync } from "react-dom";
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
import { useFeatureDocumentAutosave } from "./use-feature-document-autosave";

const m = vi.hoisted(() => ({
  update: vi.fn(),
  prune: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/fetchers/feature/feature-workspace", () => ({
  updateFeatureDocument: m.update,
  pruneFeatureAssets: m.prune,
}));
vi.mock("@/lib/upload-draft-asset", () => ({ uploadDraftAsset: m.upload }));
vi.mock("@/hooks/queries/feature/use-feature-workspace", () => ({
  featureWorkspaceKey: (project: string, feature: string) => [
    "feature-workspace",
    project,
    feature,
  ],
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
const documentKey = [
  "feature-workspace",
  "project",
  "feature",
  "document",
  "document",
];
const file = new File(["a"], "a.png", { type: "image/png" });
type Props = Parameters<typeof useFeatureDocumentAutosave>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Stores what each save sends and answers with the next revision.
function server(start: FeatureDocument = original) {
  let current = start;
  m.update.mockImplementation(
    async (
      _feature: string,
      _document: string,
      input: { title?: string; body?: string },
    ) => {
      current = {
        ...current,
        title: input.title ?? current.title,
        body: input.body ?? current.body,
        revision: current.revision + 1,
      };
      return current;
    },
  );
}

function setup(
  overrides: Partial<Props> = {},
  { client = new QueryClient(), strict = false } = {},
) {
  const props: Props = {
    projectId: "project",
    featureId: "feature",
    document: original,
    canEdit: true,
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const view = renderHook(
    (current: Props) => useFeatureDocumentAutosave(current),
    {
      initialProps: props,
      wrapper: ({ children }: { children: ReactNode }) => {
        const tree = (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
        return strict ? <StrictMode>{tree}</StrictMode> : tree;
      },
    },
  );
  return { ...view, client, props };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  m.update.mockReset();
  m.prune.mockReset().mockResolvedValue({ deletedAssetIds: [] });
  m.upload.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Feature document autosave", () => {
  it("saves once, a second after typing stops, from the opening revision", async () => {
    server();
    const { result } = setup();
    expect(result.current.status).toBe("idle");
    act(() => result.current.changeBody("A"));
    act(() => result.current.changeBody("AB"));
    expect(result.current.status).toBe("saving");
    await advance(999);
    expect(m.update).not.toHaveBeenCalled();
    await advance(1);
    expect(m.update).toHaveBeenCalledOnce();
    expect(m.update).toHaveBeenCalledWith("feature", "document", {
      body: "AB",
      expectedRevision: 1,
      keepRemovedAssets: true,
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.unsaved).toBe(false);
  });

  it("keeps typing made during a save and follows up from the answered revision", async () => {
    const first = deferred<FeatureDocument>();
    m.update
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ...original, body: "ABC", revision: 3 });
    const { result } = setup();
    act(() => result.current.changeBody("A"));
    await advance(1000);
    act(() => result.current.changeBody("AB"));
    await advance(1000);
    act(() => result.current.changeBody("ABC"));
    await advance(1000);
    expect(m.update).toHaveBeenCalledOnce();
    expect(result.current.unsaved).toBe(true);
    await act(async () => {
      first.resolve({ ...original, body: "A", revision: 2 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(m.update).toHaveBeenCalledTimes(2);
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
      body: "ABC",
      expectedRevision: 2,
      keepRemovedAssets: true,
    });
    expect(result.current.value.body).toBe("ABC");
    expect(result.current.status).toBe("saved");
  });

  it("does not overwrite a newer cached document with a delayed save response", async () => {
    const answer = deferred<FeatureDocument>();
    m.update.mockReturnValue(answer.promise);
    const { result, client } = setup();
    act(() => result.current.changeBody("My edit"));
    await advance(1000);
    client.setQueryData(documentKey, {
      ...original,
      body: "Newer external edit",
      revision: 3,
    });
    await act(async () => {
      answer.resolve({ ...original, body: "My edit", revision: 2 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getQueryData<FeatureDocument>(documentKey)).toMatchObject({
      revision: 3,
      body: "Newer external edit",
    });
  });

  it("keeps the text after a failed save and sends it again on retry", async () => {
    m.update.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
      ...original,
      title: "Renamed",
      body: "Local",
      revision: 2,
    });
    const { result } = setup();
    act(() => result.current.changeTitle("Renamed"));
    act(() => result.current.changeBody("Local"));
    await advance(1000);
    expect(result.current.status).toBe("error");
    expect(result.current.value).toEqual({ title: "Renamed", body: "Local" });
    expect(result.current.unsaved).toBe(true);
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
      title: "Renamed",
      body: "Local",
      expectedRevision: 1,
      keepRemovedAssets: true,
    });
    expect(result.current.status).toBe("saved");
  });

  describe("when someone else saved first", () => {
    const theirs = { ...original, body: "Theirs", revision: 2 };

    async function conflicted() {
      const refresh = vi.fn().mockResolvedValue(undefined);
      m.update.mockRejectedValueOnce(
        new HttpError(409, "Changed", { code: "DOCUMENT_CONFLICT" }),
      );
      const view = setup({ refresh });
      act(() => view.result.current.changeBody("Local"));
      await advance(1000);
      expect(refresh).toHaveBeenCalledOnce();
      view.rerender({ ...view.props, document: theirs });
      return view;
    }

    it("pauses saving and keeps the local text", async () => {
      const { result } = await conflicted();
      expect(result.current.status).toBe("conflict");
      expect(result.current.value.body).toBe("Local");
      act(() => result.current.changeBody("Local, more"));
      await advance(2000);
      expect(m.update).toHaveBeenCalledOnce();
    });

    it("saves the local text on top of the latest revision with Keep mine", async () => {
      const { result } = await conflicted();
      m.update.mockResolvedValueOnce({ ...theirs, body: "Local", revision: 3 });
      await act(async () => {
        result.current.keepMine();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
        body: "Local",
        expectedRevision: 2,
        keepRemovedAssets: true,
      });
      expect(result.current.conflict).toBe(false);
      expect(result.current.status).toBe("saved");
    });

    it("replaces the local text without a request with Use latest", async () => {
      const { result } = await conflicted();
      act(() => result.current.acceptLatest());
      expect(result.current.value.body).toBe("Theirs");
      expect(result.current.conflict).toBe(false);
      expect(result.current.unsaved).toBe(false);
      await advance(2000);
      expect(m.update).toHaveBeenCalledOnce();
    });
  });

  it("hides a failure once the change is undone", async () => {
    m.update.mockRejectedValueOnce(new Error("offline"));
    const { result } = setup();
    act(() => result.current.changeBody("Originalx"));
    await advance(1000);
    expect(result.current.status).toBe("error");
    act(() => result.current.changeBody("Original"));
    expect(result.current.status).toBe("idle");
    expect(result.current.unsaved).toBe(false);
    await advance(1000);
    // The failure is gone, not just hidden: the next edit is a plain save.
    server();
    act(() => result.current.changeBody("Next"));
    expect(result.current.status).toBe("saving");
    await advance(1000);
    expect(result.current.status).toBe("saved");
  });

  it("keeps one failure notice while it retries, so it is announced once", async () => {
    const retry = deferred<FeatureDocument>();
    m.update
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(retry.promise);
    const { result } = setup();
    act(() => result.current.changeBody("A"));
    await advance(1000);
    expect(result.current.status).toBe("error");
    act(() => result.current.changeBody("AB"));
    await advance(1000);
    expect(m.update).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("error");
    await act(async () => {
      retry.resolve({ ...original, body: "AB", revision: 2 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("saved");
  });

  it("adopts a newer revision in the commit that brings it, before the editor can take input", () => {
    const { result, rerender, props } = setup();
    let shown: string | undefined;
    act(() => {
      flushSync(() =>
        rerender({
          ...props,
          document: { ...original, body: "Remote", revision: 2 },
        }),
      );
      // Input can arrive as soon as this task ends, so the text the editor
      // receives must already be the adopted one.
      shown = result.current.value.body;
    });
    expect(shown).toBe("Remote");
  });

  it("shows a newer revision at once only while there are no local changes", async () => {
    const { result, rerender, props } = setup();
    rerender({
      ...props,
      document: { ...original, title: "Remote", body: "Remote", revision: 2 },
    });
    expect(result.current.value).toEqual({ title: "Remote", body: "Remote" });
    expect(result.current.unsaved).toBe(false);

    act(() => result.current.changeBody("Mine"));
    rerender({
      ...props,
      document: { ...original, body: "Again", revision: 3 },
    });
    expect(result.current.value.body).toBe("Mine");
    expect(result.current.status).toBe("conflict");
    await advance(1000);
    expect(m.update).not.toHaveBeenCalled();
  });

  it("waits for its own save before judging a newer revision", async () => {
    const answer = deferred<FeatureDocument>();
    m.update.mockReturnValueOnce(answer.promise);
    const { result, rerender, props } = setup();
    act(() => result.current.changeBody("Mine"));
    await advance(1000);
    // A refetch can return this save's revision before its response arrives.
    rerender({
      ...props,
      document: { ...original, body: "Mine", revision: 2 },
    });
    expect(result.current.conflict).toBe(false);
    expect(result.current.value.body).toBe("Mine");
    await act(async () => {
      answer.resolve({ ...original, body: "Mine", revision: 2 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("saved");
  });

  it("never sends a blank title and restores the saved one on blur", async () => {
    server();
    const { result } = setup();
    act(() => result.current.changeTitle("   "));
    await advance(1000);
    expect(m.update).not.toHaveBeenCalled();
    expect(result.current.unsaved).toBe(false);
    act(() => result.current.changeBody("Body"));
    await advance(1000);
    expect(m.update).toHaveBeenCalledWith("feature", "document", {
      body: "Body",
      expectedRevision: 1,
      keepRemovedAssets: true,
    });
    act(() => result.current.commitTitle());
    expect(result.current.value.title).toBe("Design");
  });

  it("claims referenced uploads once, keeping them staged after a failure", async () => {
    m.upload
      .mockResolvedValueOnce({ id: "kept", url: "/api/asset/kept" })
      .mockResolvedValueOnce({ id: "unused", url: "/api/asset/unused" });
    const { result } = setup();
    await act(() => result.current.upload(file));
    await act(() => result.current.upload(file));
    const body = "![a](/api/asset/kept)";
    m.update.mockRejectedValueOnce(new Error("offline"));
    act(() => result.current.changeBody(body));
    await advance(1000);
    const claimed = {
      body,
      expectedRevision: 1,
      draftAssetIds: ["kept"],
      keepRemovedAssets: true,
    };
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", claimed);

    m.update.mockResolvedValueOnce({ ...original, body, revision: 2 });
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", claimed);

    m.update.mockResolvedValueOnce({
      ...original,
      body: `${body} ok`,
      revision: 3,
    });
    act(() => result.current.changeBody(`${body} ok`));
    await advance(1000);
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
      body: `${body} ok`,
      expectedRevision: 2,
      keepRemovedAssets: true,
    });
  });

  it("accepts an upload during a save and claims it with the next one", async () => {
    const first = deferred<FeatureDocument>();
    m.update
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ...original, revision: 3 });
    m.upload.mockResolvedValueOnce({ id: "late", url: "/api/asset/late" });
    const { result } = setup();
    act(() => result.current.changeBody("Text"));
    await advance(1000);
    await act(() => result.current.upload(file));
    act(() => result.current.changeBody("Text ![x](/api/asset/late)"));
    await advance(1000);
    await act(async () => {
      first.resolve({ ...original, body: "Text", revision: 2 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
      body: "Text ![x](/api/asset/late)",
      expectedRevision: 2,
      draftAssetIds: ["late"],
      keepRemovedAssets: true,
    });
  });

  it.each([false, true])(
    "saves what is left on close, then refreshes only the list and prunes once (StrictMode: %s)",
    async (strict) => {
      const client = new QueryClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const start = {
        ...original,
        body: "![a](/api/asset/a) ![b](/api/asset/b) ![c](/api/asset/c)",
      };
      server(start);
      const { result, unmount } = setup(
        { document: start },
        { client, strict },
      );
      act(() => result.current.changeBody("![b](/api/asset/b)"));
      await advance(1000);
      // Pasting c back keeps it; a stays removed.
      act(() =>
        result.current.changeBody("![b](/api/asset/b) ![c](/api/asset/c)"),
      );
      unmount();
      await advance(0);
      expect(m.update).toHaveBeenCalledTimes(2);
      expect(m.update).toHaveBeenLastCalledWith("feature", "document", {
        body: "![b](/api/asset/b) ![c](/api/asset/c)",
        expectedRevision: 2,
        keepRemovedAssets: true,
      });
      expect(m.prune).toHaveBeenCalledOnce();
      expect(m.prune).toHaveBeenCalledWith("feature", ["a"]);
      expect(invalidate).toHaveBeenCalledOnce();
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["feature-workspace", "project", "feature", "documents"],
      });
    },
  );

  it("prunes in batches of 100 and ignores failures", async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `id${index}`);
    const start = {
      ...original,
      body: ids.map((id) => `![](/api/asset/${id})`).join(" "),
    };
    server(start);
    m.prune.mockRejectedValue(new Error("offline"));
    const { result, unmount } = setup({ document: start });
    act(() => result.current.changeBody(""));
    await advance(1000);
    unmount();
    await advance(0);
    expect(m.prune.mock.calls.map(([, batch]) => batch.length)).toEqual([
      100, 50,
    ]);
  });

  it("prunes when the page is closed or reloaded, keeping uploads the text still uses", async () => {
    const start = {
      ...original,
      body: "![a](/api/asset/a) ![b](/api/asset/b) ![c](/api/asset/c)",
    };
    server(start);
    const { result, unmount } = setup({ document: start });
    act(() => result.current.changeBody(""));
    await advance(1000);
    // Undo brings b back; the save that keeps it has not been sent yet.
    act(() => result.current.changeBody("![b](/api/asset/b)"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(m.prune).toHaveBeenCalledOnce();
    expect(m.prune).toHaveBeenCalledWith("feature", ["a", "c"]);
    unmount();
    await advance(0);
    expect(m.prune).toHaveBeenCalledOnce();
  });

  it("prunes on request, before an account action ends the session", async () => {
    const start = { ...original, body: "![a](/api/asset/a)" };
    server(start);
    const { result } = setup({ document: start });
    act(() => result.current.changeBody(""));
    await advance(1000);
    await act(() => result.current.prune());
    expect(m.prune).toHaveBeenCalledWith("feature", ["a"]);
  });

  it("closes without requests when nothing changed", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { unmount } = setup({}, { client, strict: true });
    unmount();
    await advance(1000);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.prune).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("saves when the tab is hidden", async () => {
    server();
    const { result } = setup();
    act(() => result.current.changeBody("Draft"));
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    visibility.mockRestore();
    expect(m.update).toHaveBeenCalledOnce();
  });

  it("stops saving but keeps the text when edit permission is lost", async () => {
    const { result, rerender, props } = setup();
    act(() => result.current.changeBody("Copyable draft"));
    rerender({ ...props, canEdit: false });
    await advance(2000);
    expect(m.update).not.toHaveBeenCalled();
    expect(result.current.value.body).toBe("Copyable draft");
    expect(result.current.status).toBe("readOnly");
    expect(result.current.unsaved).toBe(true);
    let flushed: boolean | undefined;
    await act(async () => {
      flushed = await result.current.flush();
    });
    expect(flushed).toBe(false);
  });

  it("discards local text so leaving and closing send nothing", async () => {
    const { result, unmount } = setup();
    act(() => result.current.changeBody("Draft"));
    act(() => result.current.discard());
    expect(result.current.value.body).toBe("Original");
    expect(result.current.unsaved).toBe(false);
    let flushed: boolean | undefined;
    await act(async () => {
      flushed = await result.current.flush();
    });
    expect(flushed).toBe(true);
    unmount();
    await advance(2000);
    expect(m.update).not.toHaveBeenCalled();
  });
});
