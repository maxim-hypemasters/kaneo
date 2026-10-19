import { type Cell, text } from "../render/cell.js";
import { renderTable } from "../render/table.js";
import { statusDot } from "../render/task-format.js";
import type { Ui } from "../render/ui.js";
import { renderTaskHeading } from "../comments/render-task-heading.js";
import { statusLabel } from "../search/render-search.js";
import type { RelatedTaskJson, RelationsJson } from "./group-relations.js";
import { relationHeading } from "./relation-types.js";

export type RelationListView = {
  readonly label: string;
  readonly title: string;
  readonly url: string;
  readonly relations: RelationsJson;
};

type Group = {
  readonly title: string;
  readonly meta: string | null;
  readonly tasks: ReadonlyArray<RelatedTaskJson>;
};

function groupsOf(relations: RelationsJson): Group[] {
  const groups: Group[] = [];
  if (relations.feature) {
    groups.push({ title: "Feature", meta: null, tasks: [relations.feature] });
  }
  if (relations.tasks.length > 0) {
    const done = relations.tasks.filter((task) => task.completed).length;
    groups.push({
      title: "Tasks",
      meta: `${done} of ${relations.tasks.length} done`,
      tasks: relations.tasks,
    });
  }
  const byType = new Map<string, RelatedTaskJson[]>();
  for (const relation of relations.relations) {
    const tasks = byType.get(relation.type) ?? [];
    tasks.push(relation.task);
    byType.set(relation.type, tasks);
  }
  for (const [type, tasks] of byType) {
    groups.push({ title: relationHeading(type), meta: null, tasks });
  }
  return groups;
}

export function renderRelationList(ui: Ui, view: RelationListView): string[] {
  const { theme } = ui;
  const heading = renderTaskHeading(ui, {
    label: view.label,
    title: view.title,
    url: view.url,
    meta: "Relations",
  });
  const groups = groupsOf(view.relations);
  if (groups.length === 0) {
    return [
      "",
      heading,
      "",
      `  ${theme.muted("No linked tasks. Link one with")} ${theme.strong(`kaneo task relation add ${view.label} <type> <task>`)}`,
      "",
    ];
  }
  const rows = renderTable(
    ui,
    groups.flatMap((group) => group.tasks),
    [
      {
        header: "ID",
        cell: (task): Cell => [
          statusDot(ui, task.status, task.completed),
          text(" "),
          text(task.ticketId ?? task.id.slice(0, 8), theme.muted, task.url),
        ],
      },
      {
        header: "Title",
        flex: true,
        minWidth: 16,
        cell: (task): Cell => [
          ...(task.type === "bug" || task.type === "feature"
            ? [text(`[${statusLabel(task.type)}] `, theme.muted)]
            : []),
          text(task.title, undefined, task.url),
        ],
      },
      {
        header: "Status",
        optional: true,
        cell: (task): Cell => [text(statusLabel(task.status), theme.muted)],
      },
    ],
    { width: ui.caps.columns, indent: 4, gap: 2 },
  );
  const lines = ["", heading, ""];
  let offset = 0;
  for (const group of groups) {
    lines.push(
      `  ${theme.strong(group.title)}${group.meta ? ` ${theme.muted(group.meta)}` : ""}`,
      ...rows.slice(offset, offset + group.tasks.length),
      "",
    );
    offset += group.tasks.length;
  }
  return lines;
}
