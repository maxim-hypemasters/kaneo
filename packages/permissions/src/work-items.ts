// A task row's `type` doubles as its permission resource: `task`, `bug` and
// `feature` rows are checked against the resource of the same name.
export const WORK_ITEM_TYPES = ["task", "bug", "feature"] as const;

export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export type WorkItemAction = "create" | "read" | "update" | "delete";

export function isWorkItemType(value: unknown): value is WorkItemType {
  return (
    typeof value === "string" &&
    (WORK_ITEM_TYPES as readonly string[]).includes(value)
  );
}
