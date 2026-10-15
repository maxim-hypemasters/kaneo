import { afterEach, expect, it } from "vite-plus/test";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { applyDefaultProjectView } from "./apply-default-project-view";

afterEach(() => {
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({
    defaultProjectView: "gantt",
    viewMode: "board",
    taskLayout: "board",
  });
});

it("opens Gantt without touching the board's mode", () => {
  useUserPreferencesStore.setState({
    defaultProjectView: "gantt",
    viewMode: "list",
  });

  expect(applyDefaultProjectView({ preload: false })).toBe("gantt");
  expect(useUserPreferencesStore.getState().viewMode).toBe("list");
});

it.each(["board", "list"] as const)("opens %s on the board route", (view) => {
  useUserPreferencesStore.setState({
    defaultProjectView: view,
    viewMode: view === "board" ? "list" : "board",
  });

  expect(applyDefaultProjectView({ preload: false })).toBe("board");
  expect(useUserPreferencesStore.getState().viewMode).toBe(view);
});

it("leaves the task layout to the view that ends up shown", () => {
  useUserPreferencesStore.setState({
    defaultProjectView: "list",
    taskLayout: "calendar",
  });

  applyDefaultProjectView({ preload: false });

  expect(useUserPreferencesStore.getState().taskLayout).toBe("calendar");
});

it("leaves the current view alone while preloading", () => {
  useUserPreferencesStore.setState({
    defaultProjectView: "board",
    viewMode: "list",
    taskLayout: "calendar",
  });

  expect(applyDefaultProjectView({ preload: true })).toBe("board");
  expect(useUserPreferencesStore.getState().viewMode).toBe("list");
  expect(useUserPreferencesStore.getState().taskLayout).toBe("calendar");
});
