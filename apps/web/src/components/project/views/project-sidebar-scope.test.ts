import { describe, expect, it } from "vite-plus/test";
import {
  projectSidebarRoute,
  projectSidebarScope,
} from "./project-sidebar-scope";

const base = "/dashboard/workspace/w/project/p";

describe("project sidebar scope", () => {
  it.each(["board", "calendar", "gantt"])("classifies %s as Tasks", (view) => {
    expect(projectSidebarScope(`${base}/${view}`, "w")).toEqual({
      projectId: "p",
      scope: "tasks",
    });
  });

  it.each(["backlog", "features", "releases"] as const)(
    "classifies %s planning navigation",
    (view) => {
      expect(projectSidebarScope(`${base}/${view}`, "w")).toEqual({
        projectId: "p",
        scope: view,
      });
    },
  );

  it("keeps a release detail in Releases regardless of an open task sheet", () => {
    expect(projectSidebarScope(`${base}/releases/r`, "w", "feature")).toEqual({
      projectId: "p",
      scope: "releases",
    });
    expect(
      projectSidebarRoute(`${base}/releases/r`, "w")?.taskId,
    ).toBeUndefined();
  });

  it("selects Features on standalone Features and Tasks on standalone Task/Bug work", () => {
    expect(projectSidebarScope(`${base}/task/f`, "w", "feature")).toEqual({
      projectId: "p",
      scope: "features",
    });
    for (const type of ["task", "bug"] as const)
      expect(projectSidebarScope(`${base}/task/t`, "w", type)).toEqual({
        projectId: "p",
        scope: "tasks",
      });
    expect(projectSidebarRoute(`${base}/task/t`, "w")?.taskId).toBe("t");
  });

  it("does not guess a standalone work type before its detail loads", () => {
    expect(projectSidebarScope(`${base}/task/f`, "w")).toBeNull();
  });

  it.each([
    base,
    `${base}/other`,
    `${base}/board/extra/deep`,
    "/dashboard/workspace/w",
    "/dashboard/settings/projects/p/general",
  ])("does not activate an unrelated route: %s", (pathname) => {
    expect(projectSidebarScope(pathname, "w")).toBeNull();
  });

  it("does not activate navigation for a different workspace", () => {
    expect(projectSidebarScope(`${base}/features`, "other")).toBeNull();
  });
});
