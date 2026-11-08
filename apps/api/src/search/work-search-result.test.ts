import { describe, expect, it } from "vite-plus/test";
import { type WorkSearchRow, workSearchResult } from "./work-search-result";

const createdAt = new Date("2026-10-01T10:00:00Z");

function row(overrides: Partial<WorkSearchRow>): WorkSearchRow {
  return {
    id: "t1",
    title: "Fix login redirect",
    description: "",
    projectId: "p1",
    projectName: "Web",
    projectSlug: "WEB",
    workspaceId: "w1",
    workspaceName: "Acme",
    userId: "u1",
    userName: "Mira",
    createdAt,
    taskNumber: 12,
    priority: "high",
    status: "in-progress",
    taskType: "task",
    archivedAt: null,
    ...overrides,
  };
}

describe("workSearchResult", () => {
  it.each(["task", "bug"] as const)(
    "maps a %s to a task result with its workflow fields",
    (taskType) => {
      expect(workSearchResult(row({ taskType }), 3)).toEqual({
        id: "t1",
        type: "task",
        taskType,
        title: "Fix login redirect",
        description: undefined,
        projectId: "p1",
        projectName: "Web",
        projectSlug: "WEB",
        workspaceId: "w1",
        workspaceName: "Acme",
        userId: "u1",
        userName: "Mira",
        createdAt,
        relevanceScore: 3,
        taskNumber: 12,
        priority: "high",
        status: "in-progress",
      });
    },
  );

  it("maps a Feature to its own result without status or priority", () => {
    const result = workSearchResult(
      row({
        taskType: "feature",
        description: "Checkout knowledge",
        status: null,
        priority: null,
        userId: null,
        userName: null,
      }),
      10,
    );
    expect(result).toMatchObject({
      type: "feature",
      taskType: "feature",
      description: "Checkout knowledge",
      archived: false,
      relevanceScore: 10,
    });
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("priority");
  });

  it("marks an archived Feature", () => {
    expect(
      workSearchResult(row({ taskType: "feature", archivedAt: createdAt }), 1),
    ).toMatchObject({ type: "feature", archived: true });
  });
});
