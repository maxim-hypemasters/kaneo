import type { RelatedTaskJson } from "../relations/group-relations.js";
import { renderTable } from "../render/table.js";
import type { Ui } from "../render/ui.js";
import { relatedTaskColumns } from "./related-task-columns.js";
import { sectionTitle } from "./section-title.js";

export function renderFeatureTasks(
  ui: Ui,
  tasks: ReadonlyArray<RelatedTaskJson>,
): string[] {
  if (tasks.length === 0) return [];
  const done = tasks.filter((task) => task.completed).length;
  return [
    sectionTitle(ui, "Tasks", `${done} of ${tasks.length} done`),
    ...renderTable(
      ui,
      tasks,
      relatedTaskColumns(ui, (task: RelatedTaskJson) => task),
      { width: ui.caps.columns, indent: 4, gap: 2 },
    ),
    "",
  ];
}
