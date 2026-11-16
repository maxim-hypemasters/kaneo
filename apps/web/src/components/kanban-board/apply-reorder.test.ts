import { expect, it } from "vite-plus/test";
import type { ProjectWithTasks } from "@/types/project";
import { applyBoardReorder } from "./apply-reorder";

it("reorders work waiting in Triage within its own bucket", () => {
  const project = {
    columns: [{ id: "c", slug: "to-do", tasks: [] }],
    plannedTasks: [],
    archivedTasks: [],
    triageTasks: [
      { id: "a", position: 1, status: "triage" },
      { id: "b", position: 2, status: "triage" },
    ],
  } as unknown as ProjectWithTasks;

  const next = applyBoardReorder(project, [
    { id: "a", position: 3, status: "triage" },
  ]);
  expect(next.triageTasks?.map((task) => task.id)).toEqual(["b", "a"]);
  expect(next.columns[0].tasks).toHaveLength(0);
});
