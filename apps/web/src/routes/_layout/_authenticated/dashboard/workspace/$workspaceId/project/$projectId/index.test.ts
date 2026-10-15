import { afterEach, expect, it, vi } from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { Route } from "./index";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  redirect: (options: unknown) => options,
}));

type IndexRoute = {
  beforeLoad: (context: {
    params: { workspaceId: string; projectId: string };
    search: { taskId?: string };
    preload: boolean;
  }) => void;
};

function redirectFor(search: { taskId?: string } = {}, preload = false) {
  try {
    (Route as unknown as IndexRoute).beforeLoad({
      params: { workspaceId: "w", projectId: "p" },
      search,
      preload,
    });
  } catch (redirect) {
    return redirect;
  }
  throw new Error("expected a redirect");
}

afterEach(() => {
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({
    defaultProjectView: "gantt",
    viewMode: "board",
    taskLayout: "board",
  });
});

it("opens the Gantt chart by default", () => {
  expect(redirectFor()).toEqual({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
    params: { workspaceId: "w", projectId: "p" },
    search: {},
    replace: true,
  });
});

it("opens the list on the board route and keeps an opened task", () => {
  useUserPreferencesStore.setState({ defaultProjectView: "list" });

  expect(redirectFor({ taskId: "t" })).toMatchObject({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
    search: { taskId: "t" },
  });
  expect(useUserPreferencesStore.getState().viewMode).toBe("list");
});

it("resolves the route without switching views on a hover preload", () => {
  useUserPreferencesStore.setState({
    defaultProjectView: "list",
    viewMode: "board",
    taskLayout: "calendar",
  });

  expect(redirectFor({}, true)).toMatchObject({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
  });
  expect(useUserPreferencesStore.getState()).toMatchObject({
    viewMode: "board",
    taskLayout: "calendar",
  });
});
