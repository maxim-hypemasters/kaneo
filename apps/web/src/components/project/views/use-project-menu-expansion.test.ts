import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import {
  useProjectMenuExpansion,
  useProjectMenuExpansionStore,
} from "./use-project-menu-expansion";

beforeEach(() =>
  useProjectMenuExpansionStore.setState(
    useProjectMenuExpansionStore.getInitialState(),
    true,
  ),
);
afterEach(cleanup);

function setup(workspaceId = "w", currentProjectId: string | undefined = "a") {
  return renderHook(
    (props: { workspaceId: string; currentProjectId: string | undefined }) =>
      useProjectMenuExpansion(props.workspaceId, props.currentProjectId),
    { initialProps: { workspaceId, currentProjectId } },
  );
}

it("opens the current project and lets other menus expand independently", () => {
  const { result } = setup();
  expect(result.current.isExpanded("a")).toBe(true);
  expect(result.current.isExpanded("b")).toBe(false);
  act(() => result.current.setExpanded("b", true));
  expect(result.current.isExpanded("a")).toBe(true);
  expect(result.current.isExpanded("b")).toBe(true);
});

it("respects manual collapse through ordinary rerenders", () => {
  const { result, rerender } = setup();
  act(() => result.current.setExpanded("a", false));
  rerender({ workspaceId: "w", currentProjectId: "a" });
  expect(result.current.isExpanded("a")).toBe(false);
});

it("opens the next project without closing other expanded menus", () => {
  const { result, rerender } = setup();
  act(() => result.current.setExpanded("c", true));
  rerender({ workspaceId: "w", currentProjectId: "b" });
  expect(result.current.isExpanded("a")).toBe(true);
  expect(result.current.isExpanded("b")).toBe(true);
  expect(result.current.isExpanded("c")).toBe(true);
});

it("reopens a manually collapsed project on returning to it", () => {
  const { result, rerender } = setup();
  act(() => result.current.setExpanded("a", false));
  rerender({ workspaceId: "w", currentProjectId: "b" });
  rerender({ workspaceId: "w", currentProjectId: "a" });
  expect(result.current.isExpanded("a")).toBe(true);
});

it("clears menu choices when changing workspaces, even with reused IDs", () => {
  const { result, rerender } = setup();
  act(() => result.current.setExpanded("c", true));
  rerender({ workspaceId: "other", currentProjectId: "b" });
  expect(result.current.isExpanded("a")).toBe(false);
  expect(result.current.isExpanded("b")).toBe(true);
  expect(result.current.isExpanded("c")).toBe(false);
});

it("starts closed outside a project and retains choices across remounts", () => {
  const { result, unmount } = renderHook(() =>
    useProjectMenuExpansion("w", undefined),
  );
  expect(result.current.isExpanded("a")).toBe(false);
  act(() => result.current.setExpanded("a", true));
  unmount();
  expect(
    renderHook(() =>
      useProjectMenuExpansion("w", undefined),
    ).result.current.isExpanded("a"),
  ).toBe(true);
});

it("keeps a manual collapse and other expanded menus through section remounts", () => {
  const first = setup();
  act(() => {
    first.result.current.setExpanded("a", false);
    first.result.current.setExpanded("b", true);
  });
  first.unmount();
  const next = setup();
  expect(next.result.current.isExpanded("a")).toBe(false);
  expect(next.result.current.isExpanded("b")).toBe(true);
});

it("retains other projects and opens the next current project after a route remount", () => {
  const first = setup();
  act(() => first.result.current.setExpanded("c", true));
  first.unmount();
  const next = setup("w", "b");
  expect(next.result.current.isExpanded("a")).toBe(true);
  expect(next.result.current.isExpanded("b")).toBe(true);
  expect(next.result.current.isExpanded("c")).toBe(true);
});

it("does not clear session choices while the workspace is temporarily unresolved", () => {
  const first = setup();
  act(() => first.result.current.setExpanded("a", false));
  first.unmount();
  const pending = renderHook(() =>
    useProjectMenuExpansion(undefined, undefined),
  );
  pending.unmount();
  expect(setup().result.current.isExpanded("a")).toBe(false);
});
