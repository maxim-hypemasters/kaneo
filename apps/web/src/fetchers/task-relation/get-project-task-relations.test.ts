import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import getProjectTaskRelations from "./get-project-task-relations";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: {
    "task-relation": { project: { ":projectId": { $get: request } } },
  },
}));

beforeEach(() => {
  request.mockReset();
});

describe("getProjectTaskRelations", () => {
  it("requests one project's relations of the given type", async () => {
    const relations = [
      { id: "r", sourceTaskId: "a", targetTaskId: "b", relationType: "blocks" },
    ];
    request.mockResolvedValue(Response.json(relations));

    await expect(getProjectTaskRelations("p", "blocks")).resolves.toEqual(
      relations,
    );
    expect(request).toHaveBeenCalledWith({
      param: { projectId: "p" },
      query: { relationType: "blocks" },
    });
  });

  it("throws the API error instead of returning it as data", async () => {
    request.mockResolvedValue(
      Response.json(
        { message: "You don't have access to this project", code: "FORBIDDEN" },
        { status: 403 },
      ),
    );

    await expect(getProjectTaskRelations("p")).rejects.toMatchObject({
      status: 403,
      message: "You don't have access to this project",
    });
  });
});
