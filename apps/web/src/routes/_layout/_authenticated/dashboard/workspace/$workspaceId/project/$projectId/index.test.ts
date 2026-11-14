import { afterEach, expect, it, vi } from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { Route } from "./index";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  redirect: (options: unknown) => options,
}));
vi.mock("@/components/project/home/project-home-page", () => ({
  ProjectHomePage: () => null,
}));

type IndexRoute = {
  validateSearch: (search: Record<string, unknown>) => unknown;
  beforeLoad: (context: {
    params: { workspaceId: string; projectId: string };
    search: { taskId?: string; featureTab?: string };
    preload: boolean;
  }) => void;
};

const route = Route as unknown as IndexRoute;

function redirectFor(
  search: { taskId?: string; featureTab?: string } = {},
  preload = false,
) {
  try {
    route.beforeLoad({
      params: { workspaceId: "w", projectId: "p" },
      search,
      preload,
    });
  } catch (redirect) {
    return redirect;
  }
  return null;
}

afterEach(() => {
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({
    defaultProjectView: "gantt",
    viewMode: "board",
    taskLayout: "board",
  });
});

it("shows the project's home page", () => {
  expect(redirectFor()).toBeNull();
  expect(
    route.validateSearch({ tab: "documents", documentId: "d" }),
  ).toMatchObject({ tab: "documents", documentId: "d" });
});

it("opens a linked task on the default Gantt chart", () => {
  expect(redirectFor({ taskId: "t" })).toEqual({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
    params: { workspaceId: "w", projectId: "p" },
    search: { taskId: "t" },
    replace: true,
  });
});

it("opens a linked task on the board route in list mode", () => {
  useUserPreferencesStore.setState({ defaultProjectView: "list" });

  expect(redirectFor({ taskId: "t" })).toMatchObject({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
    search: { taskId: "t" },
  });
  expect(useUserPreferencesStore.getState().viewMode).toBe("list");
});

it("keeps old Feature tab links working", () => {
  expect(redirectFor({ featureTab: "documents" })).toMatchObject({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
  });
});

it("resolves the route without switching views on a hover preload", () => {
  useUserPreferencesStore.setState({
    defaultProjectView: "list",
    viewMode: "board",
    taskLayout: "calendar",
  });

  expect(redirectFor({ taskId: "t" }, true)).toMatchObject({
    to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
  });
  expect(useUserPreferencesStore.getState()).toMatchObject({
    viewMode: "board",
    taskLayout: "calendar",
  });
});
