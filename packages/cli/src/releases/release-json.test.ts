import { describe, expect, it } from "vite-plus/test";
import { toReleaseJson } from "./release-json.js";
import { releaseFixture } from "./test-releases.js";

const context = {
  today: "2026-10-21",
  webUrl: "https://kaneo.test",
  project: { slug: "kan", workspaceId: "ws_1" },
};

describe("toReleaseJson", () => {
  it("adds the phase, project key and web link", () => {
    expect(
      toReleaseJson(
        releaseFixture("r1", "2.4", { description: "Payments" }),
        context,
      ),
    ).toEqual({
      id: "r1",
      projectId: "p1",
      projectKey: "KAN",
      name: "2.4",
      description: "Payments",
      startDate: "2026-10-01",
      codeFreezeDate: "2026-10-20",
      submissionDate: "2026-10-24",
      phase: "code-freeze",
      progress: {
        tasks: { total: 0, completed: 0 },
        features: { total: 0, completed: 0 },
        unfinished: 0,
      },
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      url: "https://kaneo.test/dashboard/workspace/ws_1/project/p1/releases/r1",
    });
  });

  it("has no progress when the server sent none", () => {
    const { progress: _progress, ...release } = releaseFixture("r1", "2.4");
    expect(toReleaseJson(release, context).progress).toBeNull();
  });
});
