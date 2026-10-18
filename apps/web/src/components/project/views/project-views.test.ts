import { expect, it } from "vite-plus/test";
import {
  isTaskLayoutView,
  PROJECT_ROUTE_PATHS,
  resolveProjectView,
  routeForView,
  TASK_LAYOUTS,
  tasksViewFor,
} from "./project-views";

it("serves board and list from the board route", () => {
  expect(routeForView("list")).toBe("board");
  expect(routeForView("gantt")).toBe("gantt");
  expect(resolveProjectView("board", "list")).toBe("list");
  expect(resolveProjectView("calendar", "list")).toBe("calendar");
});

it("returns to the last task layout, falling back to board or list", () => {
  expect(tasksViewFor("calendar", "list")).toBe("calendar");
  expect(tasksViewFor("gantt", "board")).toBe("gantt");
  expect(tasksViewFor("board", "list")).toBe("list");
});

it("keeps Backlog and Releases out of the task layouts", () => {
  expect(isTaskLayoutView("board")).toBe(true);
  expect(isTaskLayoutView("gantt")).toBe(true);
  expect(isTaskLayoutView("backlog")).toBe(false);
  expect(isTaskLayoutView("releases")).toBe(false);
  expect(TASK_LAYOUTS.map((layout) => layout.id)).toEqual([
    "board",
    "list",
    "calendar",
    "gantt",
  ]);
  expect(routeForView("releases")).toBe("releases");
  expect(PROJECT_ROUTE_PATHS.releases).toBe(
    "/dashboard/workspace/$workspaceId/project/$projectId/releases",
  );
});
