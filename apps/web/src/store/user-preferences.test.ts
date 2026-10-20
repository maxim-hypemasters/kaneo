import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  isDefaultProjectView,
  isGanttGroupBy,
  useUserPreferencesStore,
} from "./user-preferences";

function storePreferences(state: Record<string, unknown>) {
  localStorage.setItem(
    "user-preferences",
    JSON.stringify({ state, version: 0 }),
  );
}

afterEach(() => {
  localStorage.removeItem("user-preferences");
  useUserPreferencesStore.setState({ ganttGroupBy: "none", weekStartsOn: 0 });
});

describe("user preferences", () => {
  it("defaults the Gantt grouping to none", () => {
    expect(useUserPreferencesStore.getState().ganttGroupBy).toBe("none");
  });

  it("restores a stored Gantt grouping", async () => {
    storePreferences({ ganttGroupBy: "assignee" });

    await useUserPreferencesStore.persist.rehydrate();

    expect(useUserPreferencesStore.getState().ganttGroupBy).toBe("assignee");
  });

  it("resets invalid stored values on rehydrate", async () => {
    storePreferences({ ganttGroupBy: "status", weekStartsOn: 3 });

    await useUserPreferencesStore.persist.rehydrate();

    expect(useUserPreferencesStore.getState().ganttGroupBy).toBe("none");
    expect(useUserPreferencesStore.getState().weekStartsOn).toBe(0);
  });

  it("migrates the former Feature grouping to Milestone", async () => {
    storePreferences({ ganttGroupBy: "feature" });

    await useUserPreferencesStore.persist.rehydrate();

    expect(useUserPreferencesStore.getState().ganttGroupBy).toBe("milestone");
  });

  it("persists a changed grouping", () => {
    useUserPreferencesStore.getState().setGanttGroupBy("assignee");

    expect(
      JSON.parse(localStorage.getItem("user-preferences") ?? "{}").state
        .ganttGroupBy,
    ).toBe("assignee");
  });
});

describe("isGanttGroupBy", () => {
  it("accepts only the known groupings", () => {
    expect(isGanttGroupBy("none")).toBe(true);
    expect(isGanttGroupBy("assignee")).toBe(true);
    expect(isGanttGroupBy("milestone")).toBe(true);
    expect(isGanttGroupBy("feature")).toBe(false);
    expect(isGanttGroupBy("status")).toBe(false);
    expect(isGanttGroupBy(1)).toBe(false);
    expect(isGanttGroupBy(undefined)).toBe(false);
  });
});

describe("default project view", () => {
  afterEach(() => {
    useUserPreferencesStore.setState({
      defaultProjectView: "gantt",
      viewMode: "board",
    });
  });

  it("defaults to Gantt", () => {
    expect(useUserPreferencesStore.getState().defaultProjectView).toBe("gantt");
  });

  it("restores a stored default view", async () => {
    storePreferences({ defaultProjectView: "list" });

    await useUserPreferencesStore.persist.rehydrate();

    expect(useUserPreferencesStore.getState().defaultProjectView).toBe("list");
  });

  it("opens Gantt for preferences saved before the setting existed", async () => {
    storePreferences({ viewMode: "list" });

    await useUserPreferencesStore.persist.rehydrate();

    expect(useUserPreferencesStore.getState().defaultProjectView).toBe("gantt");
  });

  it("resets an invalid stored default view to Gantt", async () => {
    storePreferences({ defaultProjectView: "calendar" });

    await useUserPreferencesStore.persist.rehydrate();

    expect(useUserPreferencesStore.getState().defaultProjectView).toBe("gantt");
  });

  it("persists a changed default view", () => {
    useUserPreferencesStore.getState().setDefaultProjectView("board");

    expect(
      JSON.parse(localStorage.getItem("user-preferences") ?? "{}").state
        .defaultProjectView,
    ).toBe("board");
  });
});

describe("isDefaultProjectView", () => {
  it("accepts only the views a project can open in", () => {
    expect(isDefaultProjectView("gantt")).toBe(true);
    expect(isDefaultProjectView("board")).toBe(true);
    expect(isDefaultProjectView("list")).toBe(true);
    expect(isDefaultProjectView("backlog")).toBe(false);
    expect(isDefaultProjectView(undefined)).toBe(false);
  });
});
