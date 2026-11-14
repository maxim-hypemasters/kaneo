import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useCanLinkReleaseMilestones } from "./use-can-link-release-milestones";

const m = vi.hoisted(() => ({ read: true, update: true, checking: false }));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canReadMilestones: () => m.read,
    canUpdateMilestones: () => m.update,
    isCheckingPermissions: m.checking,
  }),
}));
beforeEach(() => {
  m.read = true;
  m.update = true;
  m.checking = false;
});
afterEach(cleanup);

it("allows linking with milestone read and update permission", () => {
  const hook = renderHook(() => useCanLinkReleaseMilestones(true));
  expect(hook.result.current).toBe(true);
});

it.each(["disabled", "read", "update", "checking"])(
  "keeps the picker unavailable without %s",
  (reason) => {
    if (reason === "read") m.read = false;
    if (reason === "update") m.update = false;
    if (reason === "checking") m.checking = true;
    const hook = renderHook(() =>
      useCanLinkReleaseMilestones(reason !== "disabled"),
    );
    expect(hook.result.current).toBe(false);
  },
);
