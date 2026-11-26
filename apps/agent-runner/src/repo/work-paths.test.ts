import { describe, expect, it } from "vite-plus/test";
import { mirrorPath, runPaths, runWorkId } from "./work-paths";

describe("work paths", () => {
  it("keeps a mirror per repository", () => {
    expect(mirrorPath("/work", "acme/app")).toBe("/work/mirrors/acme__app.git");
  });

  it("keeps each attempt of a run apart", () => {
    expect(runWorkId({ id: "r1", attempt: 2 })).toBe("r1-2");
  });

  it("keeps the push copy outside the run directory Hermes works in", () => {
    expect(runPaths("/work", "r1")).toEqual({
      root: "/work/runs/r1",
      repo: "/work/runs/r1/repo",
      scratch: "/work/runs/r1/scratch",
      out: "/work/runs/r1/out",
      hermes: "/work/runs/r1/hermes",
      pushRepo: "/work/push/r1.git",
    });
  });
});
