import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { useGoToProjectView } from "./use-go-to-project-view";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

beforeEach(() => {
  navigate.mockReset();
  useUserPreferencesStore.setState({ viewMode: "board", taskLayout: "gantt" });
});

afterEach(() => {
  localStorage.removeItem("user-preferences");
});

function goTo(currentRoute: "board" | "releases" | "backlog") {
  return renderHook(() =>
    useGoToProjectView({
      workspaceId: "workspace-1",
      projectId: "project-1",
      currentRoute,
    }),
  ).result.current;
}

it("opens Releases without changing the last task layout", () => {
  goTo("board")("releases");

  expect(navigate).toHaveBeenCalledWith({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/releases",
    params: { workspaceId: "workspace-1", projectId: "project-1" },
  });
  expect(useUserPreferencesStore.getState().taskLayout).toBe("gantt");
});

it("returns to the list from a release's page", () => {
  goTo("releases")("releases");

  expect(navigate).toHaveBeenCalledTimes(1);
});

it("stays put when the view shares the current route", () => {
  goTo("board")("list");
  goTo("backlog")("backlog");

  expect(navigate).not.toHaveBeenCalled();
  expect(useUserPreferencesStore.getState().taskLayout).toBe("list");
});
