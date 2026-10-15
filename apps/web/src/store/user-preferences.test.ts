import { afterEach, describe, expect, it } from "vite-plus/test";
import { isGanttGroupBy, useUserPreferencesStore } from "./user-preferences";

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
    expect(isGanttGroupBy("status")).toBe(false);
    expect(isGanttGroupBy(1)).toBe(false);
    expect(isGanttGroupBy(undefined)).toBe(false);
  });
});
