import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type {
  ReleasePlan,
  ReleasePlanChanges,
  ReleasePlanPreview,
} from "@/types/release-plan";
import { releasePlanKey, useReleasePlan } from "./use-release-plan";

const api = vi.hoisted(() => ({
  getReleasePlan: vi.fn(),
  previewReleasePlan: vi.fn(),
  applyReleasePlan: vi.fn(),
  expired: false,
}));
vi.mock("@/fetchers/release/release-plan", () => api);
vi.mock("@/components/scheduling/use-preview-expired", () => ({
  usePreviewExpired: () => api.expired,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const task: ReleasePlanPreview["tasks"][number] = {
  taskId: "task",
  title: "Release work",
  number: 1,
  identifier: "EPD-1",
  type: "task",
  completed: false,
  assigneeId: "old",
  assigneeName: "Old member",
  currentAssigneeId: "old",
  currentAssigneeName: "Old member",
  estimateSeconds: 3600,
  priority: "no-priority",
  currentStart: null,
  currentEnd: null,
  start: "2026-10-26T09:00:00Z",
  end: "2026-10-26T10:00:00Z",
  segments: [{ start: "2026-10-26T09:00:00Z", end: "2026-10-26T10:00:00Z" }],
  reason: null,
};
const read = (revision = "input", generation = 1): ReleasePlan => ({
  releaseId: "release",
  revision,
  inputRevision: revision,
  generation,
  appliedAt: null,
  planned: false,
  outdated: false,
  timeZone: "UTC",
  tasks: [task],
});
const preview: ReleasePlanPreview = {
  asOf: "2026-10-24T12:00:00Z",
  expiresAt: "2099-10-24T12:15:00Z",
  planFrom: "2026-10-26T09:00:00Z",
  revision: "token",
  inputRevision: "input",
  generation: 1,
  timeZone: "UTC",
  tasks: [task],
  dependencies: [],
  releaseDates: {
    startDate: "2026-10-26",
    codeFreezeDate: "2026-10-30",
    submissionDate: "2026-11-02",
  },
  diagnostics: [],
  warnings: [],
  scheduledCount: 1,
  unscheduledCount: 0,
  changedCount: 0,
};
const published = { ...read("published", 2), planned: true };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(open = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ active, projectId, releaseId }) =>
      useReleasePlan(projectId, releaseId, active),
    {
      wrapper,
      initialProps: {
        active: open,
        projectId: "project",
        releaseId: "release",
      },
    },
  );
  return { ...hook, client };
}
type Hook = ReturnType<typeof setup>;
const key = () =>
  releasePlanKey(
    "project",
    "release",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
async function calculate(hook: Hook) {
  await act(async () => {
    await hook.result.current.calculate.mutateAsync();
  });
  await waitFor(() => expect(hook.result.current.query.isFetching).toBe(false));
}
beforeEach(() => {
  vi.resetAllMocks();
  api.expired = false;
  api.getReleasePlan.mockResolvedValue(read());
  api.previewReleasePlan.mockResolvedValue(preview);
  api.applyReleasePlan.mockResolvedValue(published);
});
afterEach(cleanup);

describe("release plan state", () => {
  it("reads metadata only while open and never calculates until requested", async () => {
    const hook = setup(false);
    expect(api.getReleasePlan).not.toHaveBeenCalled();
    hook.rerender({ active: true, projectId: "project", releaseId: "release" });
    await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(api.getReleasePlan).toHaveBeenCalledWith("project", "release", zone);
    expect(hook.client.getQueryData(key())).toEqual(read());
    expect(hook.result.current.tasks).toEqual([task]);
    expect(api.previewReleasePlan).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("marks a frozen proposal stale after remote changes while the editor shows fresh metadata", async () => {
    const hook = setup();
    await calculate(hook);
    const updatedTask = {
      ...task,
      currentAssigneeId: "new",
      currentAssigneeName: "New member",
      estimateSeconds: 28800,
      priority: "urgent",
      start: null,
      end: null,
    };
    act(() =>
      hook.client.setQueryData(key(), {
        ...read("changed"),
        tasks: [updatedTask],
      }),
    );
    await waitFor(() => expect(hook.result.current.stale).toBe(true));
    expect(hook.result.current.tasks).toEqual([updatedTask]);
    expect(hook.result.current.preview).toEqual(preview);
    await act(async () => {
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow(
        "tasks:scheduling.stalePreview",
      );
    });
    expect(api.applyReleasePlan).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("retains the chart after Apply and compares later refreshes with the published revision", async () => {
    const hook = setup();
    const myWorkKey = ["assigned-tasks", "workspace", { countOnly: false }];
    const activityKey = ["workspace-activity", "workspace"];
    hook.client.setQueryData(["task", "unrelated"], {
      projectId: "other",
      title: "Keep",
    });
    hook.client.setQueryData(myWorkKey, { tasks: [{ id: "task" }] });
    hook.client.setQueryData(activityKey, []);
    await calculate(hook);
    api.getReleasePlan.mockResolvedValue(published);
    await act(async () => {
      await hook.result.current.apply.mutateAsync();
    });
    await waitFor(() =>
      expect(hook.result.current.query.isFetching).toBe(false),
    );
    expect(api.applyReleasePlan).toHaveBeenCalledWith("project", "release", {
      asOf: preview.asOf,
      revision: preview.revision,
      generation: preview.generation,
      timeZone: preview.timeZone,
    });
    expect(hook.result.current.preview).toEqual(preview);
    expect(hook.result.current.applied).toBe(true);
    expect(hook.result.current.stale).toBe(false);
    expect(hook.client.getQueryState(myWorkKey)?.isInvalidated).toBe(true);
    expect(hook.client.getQueryState(activityKey)?.isInvalidated).toBe(true);
    expect(hook.client.getQueryData(["task", "unrelated"])).toEqual({
      projectId: "other",
      title: "Keep",
    });
    await act(async () => {
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow();
    });
    expect(api.applyReleasePlan).toHaveBeenCalledOnce();
    act(() => hook.client.setQueryData(key(), read("later input", 2)));
    await waitFor(() => expect(hook.result.current.stale).toBe(true));
    expect(hook.result.current.preview).toEqual(preview);
    hook.unmount();
  });

  it("expires unpublished proposals but does not expire a successfully published chart", async () => {
    const hook = setup();
    await calculate(hook);
    api.expired = true;
    hook.rerender({ active: true, projectId: "project", releaseId: "release" });
    expect(hook.result.current.stale).toBe(true);
    api.expired = false;
    hook.rerender({ active: true, projectId: "project", releaseId: "release" });
    api.getReleasePlan.mockResolvedValue(published);
    await act(async () => {
      await hook.result.current.apply.mutateAsync();
    });
    api.expired = true;
    hook.rerender({ active: true, projectId: "project", releaseId: "release" });
    expect(hook.result.current.applied).toBe(true);
    expect(hook.result.current.stale).toBe(false);
    hook.unmount();
  });

  it("gates actions during input saves and patches only editor metadata after saved edits", async () => {
    const hook = setup();
    await calculate(hook);
    act(() => hook.result.current.setInputSaving("task", true));
    expect(hook.result.current.inputSaving).toBe(true);
    expect(hook.result.current.stale).toBe(true);
    act(() => hook.result.current.reset());
    expect(hook.result.current.preview).toEqual(preview);
    await act(async () => {
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow();
      await expect(
        hook.result.current.calculate.mutateAsync(),
      ).rejects.toThrow();
    });
    expect(api.applyReleasePlan).not.toHaveBeenCalled();
    expect(api.previewReleasePlan).toHaveBeenCalledTimes(1);
    const refresh = deferred<ReleasePlan>();
    api.getReleasePlan.mockReturnValue(refresh.promise);
    await act(async () => {
      await hook.result.current.inputsSaved("task", {
        currentAssigneeId: "new",
        currentAssigneeName: "New member",
        estimateSeconds: 14400,
        priority: "high",
      });
      hook.result.current.setInputSaving("task", false);
    });
    expect(hook.result.current.tasks[0]).toMatchObject({
      currentAssigneeId: "new",
      currentAssigneeName: "New member",
      estimateSeconds: 14400,
      priority: "high",
    });
    expect(hook.result.current.preview).toEqual(preview);
    expect(hook.result.current.inputSaving).toBe(false);
    await act(async () => refresh.resolve(read("saved")));
    hook.unmount();
  });

  it("cancels an initial older metadata read before refreshing a fresh proposal", async () => {
    const oldRead = deferred<ReleasePlan>();
    const updatedTask = {
      ...task,
      currentAssigneeId: "new",
      currentAssigneeName: "New member",
    };
    api.getReleasePlan
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValue({ ...read(), tasks: [updatedTask] });
    api.previewReleasePlan.mockResolvedValue({
      ...preview,
      tasks: [updatedTask],
    });
    const hook = setup();
    await waitFor(() => expect(api.getReleasePlan).toHaveBeenCalledTimes(1));
    await calculate(hook);
    await act(async () => oldRead.resolve({ ...read("old"), tasks: [task] }));
    expect(api.getReleasePlan).toHaveBeenCalledTimes(2);
    expect(hook.result.current.tasks).toEqual([updatedTask]);
    expect(hook.result.current.preview?.tasks).toEqual([updatedTask]);
    expect(hook.result.current.stale).toBe(false);
    hook.unmount();
  });

  it("removes moved or deleted work from the editor while preserving the reviewed chart", async () => {
    const hook = setup();
    await calculate(hook);
    act(() => hook.client.setQueryData(key(), { ...read("moved"), tasks: [] }));
    await waitFor(() => expect(hook.result.current.tasks).toEqual([]));
    expect(hook.result.current.preview).toEqual(preview);
    expect(hook.result.current.unavailableTaskIds.has("task")).toBe(true);
    expect(hook.result.current.stale).toBe(true);
    hook.unmount();
  });

  it("ignores a cancelled calculation even after a newer proposal has completed", async () => {
    const old = deferred<ReleasePlanPreview>();
    const next = deferred<ReleasePlanPreview>();
    api.previewReleasePlan
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const hook = setup();
    await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
    let first!: Promise<ReleasePlanPreview>;
    act(() => {
      first = hook.result.current.calculate.mutateAsync();
    });
    await waitFor(() => expect(api.previewReleasePlan).toHaveBeenCalledOnce());
    act(() => hook.result.current.cancelCalculation());
    await waitFor(() =>
      expect(hook.result.current.calculate.isPending).toBe(false),
    );
    let second!: Promise<ReleasePlanPreview>;
    act(() => {
      second = hook.result.current.calculate.mutateAsync();
    });
    await waitFor(() =>
      expect(api.previewReleasePlan).toHaveBeenCalledTimes(2),
    );
    const newest = { ...preview, revision: "newer token" };
    await act(async () => {
      next.resolve(newest);
      await second;
    });
    await act(async () => {
      old.resolve(preview);
      await first;
    });
    expect(hook.result.current.preview).toEqual(newest);
    expect(api.getReleasePlan).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("preserves a retained chart when closing a loading refresh and ignores the late result", async () => {
    const hook = setup();
    await calculate(hook);
    const refresh = deferred<ReleasePlanPreview>();
    api.previewReleasePlan.mockReturnValueOnce(refresh.promise);
    let pending!: Promise<ReleasePlanPreview>;
    act(() => {
      pending = hook.result.current.calculate.mutateAsync();
    });
    await waitFor(() =>
      expect(api.previewReleasePlan).toHaveBeenCalledTimes(2),
    );
    act(() => hook.result.current.cancelCalculation());
    expect(hook.result.current.preview).toEqual(preview);
    await waitFor(() =>
      expect(hook.result.current.calculate.isPending).toBe(false),
    );
    await act(async () => {
      refresh.resolve({ ...preview, revision: "closed" });
      await pending;
    });
    expect(hook.result.current.preview).toEqual(preview);
    hook.unmount();
  });

  it("lets editor reset dismiss a readonly calculation without accepting its late response", async () => {
    const pendingPreview = deferred<ReleasePlanPreview>();
    api.previewReleasePlan.mockReturnValue(pendingPreview.promise);
    const hook = setup();
    let pending!: Promise<ReleasePlanPreview>;
    act(() => {
      pending = hook.result.current.calculate.mutateAsync();
    });
    await waitFor(() => expect(api.previewReleasePlan).toHaveBeenCalledOnce());
    act(() => hook.result.current.reset());
    expect(hook.result.current.preview).toBeNull();
    await waitFor(() =>
      expect(hook.result.current.calculate.isPending).toBe(false),
    );
    await act(async () => {
      pendingPreview.resolve(preview);
      await pending;
    });
    expect(hook.result.current.preview).toBeNull();
    hook.unmount();
  });

  it("retains the proposal after a failed refresh or Apply", async () => {
    const hook = setup();
    await calculate(hook);
    api.previewReleasePlan.mockRejectedValueOnce(new Error("Refresh failed"));
    await act(async () => {
      await expect(hook.result.current.calculate.mutateAsync()).rejects.toThrow(
        "Refresh failed",
      );
    });
    expect(hook.result.current.preview).toEqual(preview);
    expect(hook.result.current.stale).toBe(true);
    await calculate(hook);
    api.applyReleasePlan.mockRejectedValueOnce(new Error("Inputs changed"));
    await act(async () => {
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow(
        "Inputs changed",
      );
    });
    expect(hook.result.current.preview).toEqual(preview);
    expect(hook.result.current.applied).toBe(false);
    expect(hook.result.current.stale).toBe(true);
    expect(hook.result.current.apply.error?.message).toBe("Inputs changed");
    hook.unmount();
  });

  it("does not reset or start another calculation or Apply while publication is pending", async () => {
    const hook = setup();
    await calculate(hook);
    const publication = deferred<ReleasePlan>();
    api.applyReleasePlan.mockReturnValueOnce(publication.promise);
    let pending!: Promise<ReleasePlan>;
    act(() => {
      pending = hook.result.current.apply.mutateAsync();
    });
    await waitFor(() => expect(api.applyReleasePlan).toHaveBeenCalledOnce());
    act(() => hook.result.current.reset());
    expect(hook.result.current.preview).toEqual(preview);
    await act(async () => {
      await expect(
        hook.result.current.calculate.mutateAsync(),
      ).rejects.toThrow();
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow();
    });
    expect(api.previewReleasePlan).toHaveBeenCalledOnce();
    expect(api.applyReleasePlan).toHaveBeenCalledOnce();
    expect(hook.result.current.apply.isPending).toBe(true);
    expect(hook.result.current.apply.error).toBeNull();
    api.getReleasePlan.mockResolvedValue(published);
    await act(async () => {
      publication.resolve(published);
      await pending;
    });
    expect(hook.result.current.applied).toBe(true);
    expect(hook.result.current.apply.isPending).toBe(false);
    expect(hook.result.current.preview).toEqual(preview);
    hook.unmount();
  });

  it("rejects Apply if metadata access has failed and preserves the chart", async () => {
    const hook = setup();
    await calculate(hook);
    api.getReleasePlan.mockRejectedValueOnce(new Error("No access"));
    await act(async () => {
      await hook.result.current.query.refetch();
    });
    await waitFor(() => expect(hook.result.current.query.isError).toBe(true));
    await act(async () => {
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow();
    });
    expect(api.applyReleasePlan).not.toHaveBeenCalled();
    expect(hook.result.current.preview).toEqual(preview);
    hook.unmount();
  });

  it("ignores calculation responses from a previous project or release context", async () => {
    const old = deferred<ReleasePlanPreview>();
    api.previewReleasePlan.mockReturnValueOnce(old.promise);
    const hook = setup();
    let pending!: Promise<ReleasePlanPreview>;
    act(() => {
      pending = hook.result.current.calculate.mutateAsync();
    });
    await waitFor(() => expect(api.previewReleasePlan).toHaveBeenCalledOnce());
    hook.rerender({
      active: true,
      projectId: "other project",
      releaseId: "other release",
    });
    await act(async () => {
      old.resolve(preview);
      await pending;
    });
    expect(hook.result.current.preview).toBeNull();
    expect(hook.result.current.applied).toBe(false);
    expect(api.getReleasePlan).toHaveBeenCalledWith(
      "other project",
      "other release",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    hook.unmount();
  });

  it("previews staged fixes without publishing, then applies exactly the reviewed changes", async () => {
    const hook = setup();
    await calculate(hook);
    const changes: ReleasePlanChanges = {
      newRelease: {
        key: "next",
        name: "1.1",
        startDate: "2026-11-03",
        codeFreezeDate: "2026-11-10",
        submissionDate: "2026-11-12",
      },
      moves: [{ taskId: "task", target: { draftKey: "next" } }],
    };
    const revised = {
      ...preview,
      revision: "with-draft",
      tasks: [],
      scheduledCount: 0,
      changes,
    };
    api.previewReleasePlan.mockResolvedValueOnce(revised);
    act(() => hook.result.current.updateChanges(changes));
    await waitFor(() =>
      expect(hook.result.current.preview?.revision).toBe("with-draft"),
    );
    expect(api.previewReleasePlan).toHaveBeenLastCalledWith(
      "project",
      "release",
      expect.any(String),
      changes,
    );
    expect(api.applyReleasePlan).not.toHaveBeenCalled();
    expect(hook.result.current.tasks).toEqual([task]);
    expect(hook.result.current.remainingTasks).toEqual([]);
    expect(hook.result.current.hasChanges).toBe(true);
    expect(hook.result.current.stale).toBe(false);
    const movedRead = { ...published, tasks: [] };
    api.getReleasePlan.mockResolvedValue(movedRead);
    api.applyReleasePlan.mockResolvedValueOnce(movedRead);
    await act(async () => {
      await hook.result.current.apply.mutateAsync();
    });
    expect(api.applyReleasePlan).toHaveBeenCalledWith("project", "release", {
      asOf: revised.asOf,
      revision: revised.revision,
      generation: revised.generation,
      timeZone: revised.timeZone,
      changes,
    });
    await waitFor(() =>
      expect(hook.result.current.query.isFetching).toBe(false),
    );
    expect(hook.result.current.applied).toBe(true);
    expect(hook.result.current.stale).toBe(false);
    expect(hook.result.current.hasChanges).toBe(false);
    expect(hook.result.current.resolutionTasks).toEqual([task]);
    act(() =>
      hook.client.setQueryData(key(), {
        ...movedRead,
        inputRevision: "external",
        revision: "external",
      }),
    );
    await waitFor(() => expect(hook.result.current.stale).toBe(true));
    api.getReleasePlan.mockResolvedValue({
      ...movedRead,
      inputRevision: "external",
      revision: "external",
    });
    api.previewReleasePlan.mockResolvedValueOnce({
      ...revised,
      revision: "refreshed-after-apply",
      inputRevision: "external",
      generation: movedRead.generation,
      changes: {},
    });
    await act(async () => {
      await hook.result.current.calculate.mutateAsync();
    });
    expect(api.previewReleasePlan).toHaveBeenLastCalledWith(
      "project",
      "release",
      expect.any(String),
      undefined,
    );
    expect(hook.result.current.changes).toEqual({});
    expect(hook.result.current.hasChanges).toBe(false);
    hook.unmount();
  });

  it("keeps draft fixes and the previous chart when recalculation fails", async () => {
    const hook = setup();
    await calculate(hook);
    api.previewReleasePlan.mockRejectedValueOnce(
      new Error("Could not calculate draft"),
    );
    const changes = {
      releaseDates: {
        codeFreezeDate: "2026-11-03",
        submissionDate: "2026-11-05",
      },
    };
    act(() => hook.result.current.updateChanges(changes));
    await waitFor(() =>
      expect(hook.result.current.calculate.error?.message).toBe(
        "Could not calculate draft",
      ),
    );
    expect(hook.result.current.preview).toEqual(preview);
    expect(hook.result.current.changes).toEqual(changes);
    expect(hook.result.current.hasChanges).toBe(true);
    expect(hook.result.current.stale).toBe(true);
    await act(async () => {
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow();
    });
    expect(api.applyReleasePlan).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("rejects direct publication of a code-freeze conflict", async () => {
    api.previewReleasePlan.mockResolvedValueOnce({
      ...preview,
      warnings: [{ taskId: task.taskId, reason: "after_code_freeze" }],
    });
    const hook = setup();
    await calculate(hook);
    expect(hook.result.current.deadlineConflicts).toBe(true);
    await act(async () => {
      await expect(hook.result.current.apply.mutateAsync()).rejects.toThrow();
    });
    expect(api.applyReleasePlan).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("discards fixes without publishing and ignores their late calculation response", async () => {
    const hook = setup();
    await calculate(hook);
    const response = deferred<ReleasePlanPreview>();
    api.previewReleasePlan.mockReturnValueOnce(response.promise);
    act(() =>
      hook.result.current.updateChanges({
        releaseDates: {
          codeFreezeDate: "2026-11-03",
          submissionDate: "2026-11-05",
        },
      }),
    );
    await waitFor(() =>
      expect(api.previewReleasePlan).toHaveBeenCalledTimes(2),
    );
    act(() => {
      hook.result.current.cancelCalculation();
      hook.result.current.discardChanges();
    });
    await act(async () =>
      response.resolve({ ...preview, revision: "late-draft" }),
    );
    expect(hook.result.current.preview).toBeNull();
    expect(hook.result.current.changes).toEqual({});
    expect(hook.result.current.hasChanges).toBe(false);
    expect(api.applyReleasePlan).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("keeps the reviewed chart outdated if a change races the post-commit read", async () => {
    const hook = setup();
    await calculate(hook);
    const raced = { ...published, outdated: true };
    api.applyReleasePlan.mockResolvedValueOnce(raced);
    api.getReleasePlan.mockResolvedValue(raced);
    await act(async () => {
      await hook.result.current.apply.mutateAsync();
    });
    expect(hook.result.current.applied).toBe(true);
    expect(hook.result.current.stale).toBe(true);
    expect(hook.result.current.preview).toEqual(preview);
    hook.unmount();
  });
});
