import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ScheduledLeaf } from "./gantt-types";
import { useGanttTaskCommits } from "./use-gantt-task-commits";

const m = vi.hoisted(() => ({ move: vi.fn() }));

vi.mock("@/fetchers/task/move-task-schedule", () => ({ default: m.move }));
vi.mock("@/fetchers/milestone/milestones", () => ({
  updateMilestone: vi.fn(),
  setTaskMilestone: vi.fn(),
}));
vi.mock("@/hooks/mutations/task/use-update-task-assignee", () => ({
  useUpdateTaskAssignee: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/invalidate-my-work", () => ({ invalidateMyWork: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const day = (date: number) => new Date(2026, 8, date);
// A fresh object each time, as a refetch gives.
const tasks = (start = day(3), end = day(5)): ScheduledLeaf[] => [
  {
    id: "task",
    projectId: "project",
    title: "Task",
    status: "to-do",
    startDate: "2026-09-03",
    dueDate: "2026-09-05",
    userId: null,
    featureId: null,
    milestoneId: null,
    scheduleStart: start,
    scheduleEnd: end,
  } as ScheduledLeaf,
];
const edit = {
  start: day(3),
  end: day(8),
  userId: null,
  featureId: null,
  milestoneId: null,
  exact: true,
};
const assignee = { name: null, image: null };

beforeEach(() => {
  m.move.mockReset().mockResolvedValue({});
});

describe("a saved Gantt edit waiting for its refetch", () => {
  it("stays through unrelated reloads until the data placing the bars is newer", async () => {
    const { result, rerender } = renderHook(
      ({ list, at }) => useGanttTaskCommits(list, at),
      { initialProps: { list: tasks(), at: 1 } },
    );

    await act(async () => {
      await result.current.commit(tasks()[0]!, edit, assignee);
    });
    expect(m.move).toHaveBeenCalledWith("task", day(3), day(8), true);
    expect(result.current.pending.get("task")?.end).toEqual(day(8));

    // The task list reloads (a websocket patch, say) with the old placement.
    rerender({ list: tasks(), at: 1 });
    rerender({ list: tasks(), at: 1 });
    expect(result.current.pending.has("task")).toBe(true);

    // The schedule reloads and disagrees (the server laid it out elsewhere).
    rerender({ list: tasks(day(3), day(7)), at: 2 });
    await waitFor(() => expect(result.current.pending.has("task")).toBe(false));
  });

  it("is dropped as soon as the reloaded data shows it", async () => {
    const { result, rerender } = renderHook(
      ({ list, at }) => useGanttTaskCommits(list, at),
      { initialProps: { list: tasks(), at: 1 } },
    );
    await act(async () => {
      await result.current.commit(tasks()[0]!, edit, assignee);
    });

    rerender({ list: tasks(day(3), day(8)), at: 1 });
    await waitFor(() => expect(result.current.pending.has("task")).toBe(false));
  });

  it("gives up on any reload when no load time is known", async () => {
    const { result, rerender } = renderHook(
      ({ list }) => useGanttTaskCommits(list),
      { initialProps: { list: tasks() } },
    );
    await act(async () => {
      await result.current.commit(tasks()[0]!, edit, assignee);
    });

    rerender({ list: tasks() });
    await waitFor(() => expect(result.current.pending.has("task")).toBe(false));
  });
});
