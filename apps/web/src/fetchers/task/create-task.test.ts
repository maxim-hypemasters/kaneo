import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import createTask from "./create-task";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@kaneo/libs", () => ({
  client: {
    task: {
      ":projectId": {
        $post: mocks.post,
      },
    },
  },
}));

describe("createTask", () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.post.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "task-1" }),
    });
  });

  it.each([undefined, ""])(
    "omits the assignee when userId is %s",
    async (userId) => {
      await createTask(
        "Unassigned task",
        "",
        "project-1",
        userId,
        "to-do",
        undefined,
        undefined,
        "no-priority",
      );

      expect(mocks.post).toHaveBeenCalledWith({
        json: {
          title: "Unassigned task",
          description: "",
          status: "to-do",
          startDate: undefined,
          dueDate: undefined,
          priority: "no-priority",
        },
        param: { projectId: "project-1" },
      });
    },
  );

  it.each([
    ["a release", "release-1", { releaseId: "release-1" }],
    ["no release", null, { releaseId: null }],
    ["the feature's release", undefined, {}],
  ])("sends %s as asked", async (_name, releaseId, sent) => {
    await createTask(
      "Released task",
      "",
      "project-1",
      undefined,
      "to-do",
      undefined,
      undefined,
      "no-priority",
      undefined,
      undefined,
      { featureId: "feature-1", releaseId },
    );

    expect(mocks.post).toHaveBeenCalledWith({
      json: {
        title: "Released task",
        description: "",
        status: "to-do",
        startDate: undefined,
        dueDate: undefined,
        priority: "no-priority",
        featureId: "feature-1",
        ...sent,
      },
      param: { projectId: "project-1" },
    });
  });

  it("preserves an assigned userId", async () => {
    await createTask(
      "Assigned task",
      "",
      "project-1",
      "user-1",
      "to-do",
      undefined,
      undefined,
      "no-priority",
    );

    expect(mocks.post).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ userId: "user-1" }),
      }),
    );
  });
});
