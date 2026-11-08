import { describe, expect, it } from "vite-plus/test";
import { featureRoute } from "./feature-route";

describe("featureRoute", () => {
  it("opens a Feature in the task route", () => {
    expect(featureRoute("w1", "p1", "f1")).toEqual({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: { workspaceId: "w1", projectId: "p1", taskId: "f1" },
      search: {},
    });
  });

  it("carries the workspace tab and its content", () => {
    expect(
      featureRoute("w1", "p1", "f1", {
        featureTab: "documents",
        featureDocumentId: "d1",
      }).search,
    ).toEqual({ featureTab: "documents", featureDocumentId: "d1" });
  });
});
