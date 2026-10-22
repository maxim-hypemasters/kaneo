import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useCanLinkReleaseMilestones } from "./use-can-link-release-milestones";

const m = vi.hoisted(() => ({
  update: true,
  checking: false,
  workspace: "w",
  role: "member",
  read: vi.fn(),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateTasks: () => m.update,
    isCheckingPermissions: m.checking,
    hasPermission: m.read,
    workspace: { id: m.workspace },
    role: m.role,
  }),
}));
beforeEach(() => {
  m.update = true;
  m.checking = false;
  m.workspace = "w";
  m.role = "member";
  m.read.mockReset().mockResolvedValue(true);
});
afterEach(cleanup);

it("requires read permission as well as task-update permission", async () => {
  m.read.mockResolvedValue(false);
  const hook = renderHook(() => useCanLinkReleaseMilestones(true));
  expect(hook.result.current).toBe(false);
  await act(async () => {});
  expect(hook.result.current).toBe(false);
  expect(m.read).toHaveBeenCalledWith({ task: ["read"] });
});

it("allows the picker only after the read check succeeds", async () => {
  const hook = renderHook(() => useCanLinkReleaseMilestones(true));
  expect(hook.result.current).toBe(false);
  await act(async () => {});
  expect(hook.result.current).toBe(true);
});

it("keeps the picker unavailable after a permission-check error", async () => {
  m.read.mockRejectedValue(new Error("Unavailable"));
  const hook = renderHook(() => useCanLinkReleaseMilestones(true));
  await act(async () => {});
  expect(hook.result.current).toBe(false);
});

it.each(["disabled", "update", "checking"])(
  "does not read when unavailable: %s",
  async (reason) => {
    if (reason === "update") m.update = false;
    if (reason === "checking") m.checking = true;
    const hook = renderHook(() =>
      useCanLinkReleaseMilestones(reason !== "disabled"),
    );
    await act(async () => {});
    expect(hook.result.current).toBe(false);
    expect(m.read).not.toHaveBeenCalled();
  },
);

it("ignores a stale read result after workspace change", async () => {
  let resolve!: (allowed: boolean) => void;
  m.read
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue(false);
  const hook = renderHook(() => useCanLinkReleaseMilestones(true));
  m.workspace = "other";
  hook.rerender();
  await act(async () => {
    resolve(true);
  });
  expect(hook.result.current).toBe(false);
});

it("revokes the previous grant immediately when the role changes", async () => {
  const hook = renderHook(() => useCanLinkReleaseMilestones(true));
  await act(async () => {});
  expect(hook.result.current).toBe(true);
  m.role = "restricted";
  m.read.mockReturnValue(new Promise<boolean>(() => {}));
  hook.rerender();
  expect(hook.result.current).toBe(false);
});
