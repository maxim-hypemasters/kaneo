import {
  isWorkItemType,
  type WorkItemType,
  type WorkspaceCapability,
} from "@kaneo/permissions";

export type WorkItemCapabilityAction = "create" | "update" | "delete";

const CAPABILITIES: Record<
  WorkItemType,
  Record<WorkItemCapabilityAction, WorkspaceCapability>
> = {
  task: { create: "createTasks", update: "updateTasks", delete: "deleteTasks" },
  bug: { create: "createBugs", update: "updateBugs", delete: "deleteBugs" },
  feature: {
    create: "createFeatures",
    update: "updateFeatures",
    delete: "deleteFeatures",
  },
};

// A task row's type picks its permission: bugs need the bug capabilities,
// features the feature ones. Rows without a known type count as tasks.
export function workItemCapability(
  type: string | null | undefined,
  action: WorkItemCapabilityAction,
): WorkspaceCapability {
  return CAPABILITIES[isWorkItemType(type) ? type : "task"][action];
}
