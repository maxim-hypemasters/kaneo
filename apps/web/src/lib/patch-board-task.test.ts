import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ProjectWithTasks } from "@/types/project";
import {
  getBoardCacheVersion,
  markBoardCacheChanged,
} from "./board-cache-version";
import { patchBoardTask } from "./patch-board-task";
import { updateBoardTaskCache } from "./update-board-task-cache";

function board() {
  return {
    id: "p",
    columns: [
      {
        id: "todo",
        slug: "todo",
        tasks: [
          {
            id: "a",
            projectId: "p",
            status: "todo",
            title: "old",
            userId: "u",
            assigneeId: "u",
            labels: [{ id: "label" }],
            subtaskCounts: { completed: 1, total: 3 },
          },
        ],
      },
      { id: "doing", slug: "doing", tasks: [] },
    ],
    archivedTasks: [],
    plannedTasks: [],
  } as unknown as ProjectWithTasks;
}

describe("bounded board cache updates", () => {
  it("does not insert a Feature into an execution board after a realtime refresh", () => {
    const current = board();
    const updated = patchBoardTask(current, "feature", {
      id: "feature",
      projectId: "p",
      type: "feature",
      status: null,
      title: "Knowledge",
    });
    expect(updated?.columns.flatMap((column) => column.tasks)).toHaveLength(1);
    expect(updated?.plannedTasks).toHaveLength(0);
  });
  it("removes an old Feature card when its current knowledge record arrives", () => {
    const current = board();
    current.columns[0].tasks[0] = {
      ...current.columns[0].tasks[0],
      type: "feature",
    };
    const updated = patchBoardTask(current, "a", {
      projectId: "p",
      type: "feature",
      status: null,
    });
    expect(updated?.columns.flatMap((column) => column.tasks)).toHaveLength(0);
  });
  it("preserves metadata and the assignee when updating a single field", () => {
    const client = new QueryClient();
    client.setQueryData(["tasks", "p"], board());
    updateBoardTaskCache(client, "p", "a", { title: "new" });
    expect(
      client.getQueryData<ProjectWithTasks>(["tasks", "p"])?.columns[0]
        .tasks[0],
    ).toMatchObject({
      title: "new",
      assigneeId: "u",
      labels: [{ id: "label" }],
      subtaskCounts: { completed: 1, total: 3 },
    });
    client.clear();
  });

  it("lets a pending board load finish and applies only the newest local edit afterward", async () => {
    const client = new QueryClient();
    let finish!: (value: ProjectWithTasks) => void;
    const loading = client.fetchQuery({
      queryKey: ["tasks", "p"],
      queryFn: () =>
        new Promise<ProjectWithTasks>((resolve) => {
          finish = resolve;
        }),
    });
    updateBoardTaskCache(client, "p", "a", { title: "first" });
    updateBoardTaskCache(client, "p", "a", { title: "latest" });
    expect(client.getQueryState(["tasks", "p"])?.fetchStatus).toBe("fetching");
    finish(board());
    await loading;
    expect(
      client.getQueryData<ProjectWithTasks>(["tasks", "p"])?.columns[0].tasks[0]
        .title,
    ).toBe("latest");
    client.clear();
  });

  it("moves a refreshed task by column slug and removes tasks moved out of the project", () => {
    const moved = patchBoardTask(board(), "a", {
      projectId: "p",
      status: "doing",
    })!;
    expect(moved.columns[0].tasks).toHaveLength(0);
    expect(moved.columns[1].tasks.map((task) => task.id)).toEqual(["a"]);
    expect(
      patchBoardTask(moved, "a", { projectId: "other" })?.columns[1].tasks,
    ).toHaveLength(0);
  });

  it("keeps missing-column work discoverable through release edits and later status refreshes", () => {
    const client = new QueryClient();
    const legacy = patchBoardTask(board(), "a", {
      projectId: "p",
      status: "removed-column",
      type: "bug",
    })!;
    client.setQueryData(["tasks", "p"], legacy);
    updateBoardTaskCache(client, "p", "a", { releaseId: "release" });
    const linked = client.getQueryData<ProjectWithTasks>(["tasks", "p"])!;
    expect(linked.columns.flatMap((column) => column.tasks)).toEqual([]);
    expect(linked.plannedTasks).toEqual([
      expect.objectContaining({
        id: "a",
        type: "bug",
        status: "removed-column",
        releaseId: "release",
        labels: [{ id: "label" }],
      }),
    ]);
    const active = patchBoardTask(linked, "a", {
      projectId: "p",
      status: "doing",
    })!;
    expect(active.plannedTasks).toEqual([]);
    expect(active.columns[1].tasks).toHaveLength(1);
    const archived = patchBoardTask(linked, "a", {
      projectId: "p",
      status: "archived",
    })!;
    expect(archived.plannedTasks).toEqual([]);
    expect(archived.archivedTasks).toHaveLength(1);
    client.clear();
  });

  it("does not invent a partial card when a release update targets work absent from the cache", () => {
    const client = new QueryClient();
    client.setQueryData(["tasks", "p"], board());
    updateBoardTaskCache(client, "not-loaded", "missing", {
      releaseId: "release",
    });
    expect(client.getQueryData(["tasks", "not-loaded"])).toBeUndefined();
    updateBoardTaskCache(client, "p", "missing", { releaseId: "release" });
    expect(
      client.getQueryData<ProjectWithTasks>(["tasks", "p"])?.plannedTasks,
    ).toEqual([]);
    client.clear();
  });
});

it("rejects a late mutation response after a newer socket patch", () => {
  const client = new QueryClient();
  client.setQueryData(["tasks", "p"], board());
  markBoardCacheChanged(client, "p", "a");
  const version = getBoardCacheVersion(client, "p", "a");
  const invalidate = vi.spyOn(client, "invalidateQueries");
  markBoardCacheChanged(client, "p", "a");
  client.setQueryData(
    ["tasks", "p"],
    patchBoardTask(board(), "a", { projectId: "p", title: "remote" }),
  );
  updateBoardTaskCache(client, "p", "a", { title: "late response" }, version);
  expect(
    client.getQueryData<ProjectWithTasks>(["tasks", "p"])?.columns[0].tasks[0]
      .title,
  ).toBe("remote");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tasks", "p"] });
  client.clear();
});
it("defers descriptions exceeding the UTF-8 board limit", () => {
  const updated = patchBoardTask(board(), "a", {
    projectId: "p",
    description: "😀".repeat(20000),
  });
  expect(updated?.columns[0].tasks[0]).toMatchObject({
    description: null,
    descriptionDeferred: true,
  });
});
it("applies a leaf classification change and clears reported Feature membership", () => {
  const member = patchBoardTask(board(), "a", {
    projectId: "p",
    type: "task",
    featureId: "feature",
  })!;
  expect(member.columns[0].tasks[0]).toMatchObject({ featureId: "feature" });

  const updated = patchBoardTask(member, "a", {
    projectId: "p",
    type: "bug",
    featureId: null,
  });
  expect(updated?.columns[0].tasks[0]).toMatchObject({
    type: "bug",
    featureId: null,
    labels: [{ id: "label" }],
  });
});
