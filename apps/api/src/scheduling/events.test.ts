import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (data: Record<string, unknown>) => Promise<void>>(),
  reads: [] as Array<Array<Record<string, unknown>>>,
  dependents: [] as Array<{ projectId: string }>,
  broadcast: vi.fn(),
  select: vi.fn(),
  distinct: vi.fn(),
}));
vi.mock("../events", () => ({
  subscribeToEvent: async (
    name: string,
    callback: (data: Record<string, unknown>) => Promise<void>,
  ) => {
    mocks.handlers.set(name, callback);
  },
}));
vi.mock("../ws", () => ({ broadcastToProject: mocks.broadcast }));
vi.mock("../database", () => ({
  default: { select: mocks.select, selectDistinct: mocks.distinct },
}));

function query(rows: Record<string, unknown>[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: async () => rows,
  };
  return chain;
}
async function event(name: string, data: Record<string, unknown>) {
  const handler = mocks.handlers.get(name);
  expect(handler, `missing ${name} scheduling subscriber`).toBeDefined();
  await handler!(data);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  mocks.handlers.clear();
  mocks.reads = [];
  mocks.dependents = [];
  mocks.broadcast.mockReset();
  mocks.select
    .mockReset()
    .mockImplementation(() => query(mocks.reads.shift() ?? []));
  mocks.distinct.mockReset().mockImplementation(() => query(mocks.dependents));
  await import("./events");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("planning input events", () => {
  it.each([
    "task.created",
    "task.updated",
    "task.status_changed",
    "task.priority_changed",
    "task.assignee_changed",
    "task.unassigned",
    "task.bulk_unassigned",
    "tasks.reordered",
    "task-relation.refresh",
    "release.changed",
    "milestone.changed",
    "project.updated",
    "project_access.updated",
    "project_members.updated",
    "project-schedule.changed",
  ])("invalidates a project for %s", async (name) => {
    await event(name, { projectId: "project" });
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.broadcast).toHaveBeenCalledExactlyOnceWith("project", {
      type: "SCHEDULE_UPDATED",
      projectId: "project",
      schedulePublished: false,
    });
  });

  it("coalesces repeated edits and preserves a published Apply signal only for its project", async () => {
    mocks.dependents = [{ projectId: "dependent" }];
    await event("task.updated", { projectId: "project" });
    await event("tasks.reordered", { projectId: "project" });
    await event("project-schedule.changed", {
      projectId: "project",
      published: true,
    });
    expect(mocks.broadcast).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.broadcast.mock.calls).toEqual([
      [
        "project",
        {
          type: "SCHEDULE_UPDATED",
          projectId: "project",
          schedulePublished: true,
        },
      ],
      [
        "dependent",
        {
          type: "SCHEDULE_UPDATED",
          projectId: "dependent",
          schedulePublished: false,
        },
      ],
    ]);
    expect(mocks.distinct).toHaveBeenCalledOnce();
  });

  it.each(["time-entry.created", "time-entry.updated", "time-entry.deleted"])(
    "resolves the owning project for %s without task metadata in the broadcast",
    async (name) => {
      mocks.reads.push([{ projectId: "project" }]);
      await event(name, { taskId: "private-task", duration: 3600 });
      await vi.advanceTimersByTimeAsync(150);
      expect(mocks.select).toHaveBeenCalledOnce();
      expect(mocks.broadcast).toHaveBeenCalledExactlyOnceWith("project", {
        type: "SCHEDULE_UPDATED",
        projectId: "project",
        schedulePublished: false,
      });
    },
  );

  it.each(["task-relation.created", "task-relation.deleted"])(
    "reconciles both ends of cross-project %s edges",
    async (name) => {
      mocks.reads.push([{ projectId: "target-project" }]);
      await event(name, {
        projectId: "source-project",
        targetTaskId: "target-task",
      });
      await vi.advanceTimersByTimeAsync(150);
      expect(mocks.broadcast.mock.calls.map(([id]) => id)).toEqual([
        "source-project",
        "target-project",
      ]);
    },
  );

  it("reconciles source and destination after moves", async () => {
    mocks.reads.push([{ projectId: "destination" }]);
    await event("task.moved", {
      taskId: "task",
      fromProjectId: "source",
      toProjectId: "destination",
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.broadcast.mock.calls.map(([id]) => id)).toEqual([
      "destination",
      "source",
    ]);
  });

  it("reconciles workspace plans after membership changes and project cascades", async () => {
    mocks.reads.push([{ id: "first" }, { id: "second" }]);
    await event("project-schedule.changed", { workspaceId: "workspace" });
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.broadcast.mock.calls.map(([id]) => id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("uses the workspace for deleted blockers whose dependency edges no longer exist", async () => {
    mocks.reads.push(
      [{ workspaceId: "workspace" }],
      [{ id: "project" }, { id: "dependent" }],
    );
    await event("task.deleted", {
      projectId: "project",
      taskId: "deleted-task",
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.broadcast.mock.calls.map(([id]) => id)).toEqual([
      "project",
      "dependent",
    ]);
    expect(mocks.distinct).not.toHaveBeenCalled();
  });
});
