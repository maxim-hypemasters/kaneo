import type { PermissionMap } from "../../utils/role-permissions";
import type { ReadReceipt } from "../message-types";

/**
 * How the assistant exposes one registry tool. Whether a tool reads or writes
 * comes only from the registry's `readOnlyHint`, never from this table.
 */
export type CatalogEntry = {
  /** Removed from the model's schema and injected on every call. */
  pin?: "workspaceId"[];
  /** Removed from the model's schema, and refused if the model sends them. */
  omit?: string[];
  /**
   * Set by the server, never by the model: removed from the model's schema
   * and dropped if sent anyway, since a tool description may still ask for
   * them.
   */
  serverSet?: string[];
  /** Injected when the model leaves them out. */
  defaults?: Record<string, unknown>;
  /** Write tools: offered when the caller has any one of these. */
  requires?: PermissionMap[];
  /**
   * Fields that need task:assign, as dot paths (`a.b[].c` reaches into array
   * items). Removed from the schema and refused when the caller lacks it.
   */
  assignFields?: string[];
  /** A message for the model when the arguments are out of scope. */
  refuse?: (args: Record<string, unknown>) => string | null;
  /** Reads that can yield a read receipt, and writes that can rewrite a body. */
  document?: ReadReceipt["kind"];
};

const WORKSPACE_PIN: CatalogEntry["pin"] = ["workspaceId"];

// Permission bundles, matching what each target API route checks.
const anyWorkItem = (action: "create" | "update"): PermissionMap[] => [
  { task: [action] },
  { bug: [action] },
  { feature: [action] },
];
const executionUpdate: PermissionMap[] = [
  { task: ["update"] },
  { bug: ["update"] },
];
const featureUpdate: PermissionMap[] = [{ feature: ["update"] }];

// Virtual statuses the assistant never sets: `archived` archives the task,
// which is out of scope, and only Kaneo's creation rule puts new work in
// `triage`. Literals, since this module stays free of runtime imports.
function refuseVirtualStatus(args: Record<string, unknown>): string | null {
  if (typeof args.status !== "string") return null;
  switch (args.status.trim().toLowerCase()) {
    case "archived":
      return "The assistant can't archive work. Pick one of the project's columns (list_project_columns).";
    case "triage":
      return "The assistant can't move work into Triage: new Tasks and Bugs from people who aren't the project's triage members go there on their own. Pick one of the project's columns (list_project_columns).";
    default:
      return null;
  }
}

/** The explicit allowlist. Every registry tool is here or in EXCLUDED_TOOLS. */
export const ASSISTANT_TOOL_CATALOG: Record<string, CatalogEntry> = {
  // Workspace-wide reads, pinned to the chat's workspace.
  list_projects: { pin: WORKSPACE_PIN },
  list_workspace_members: { pin: WORKSPACE_PIN },
  list_workspace_labels: { pin: WORKSPACE_PIN },
  list_my_tasks: { pin: WORKSPACE_PIN },
  list_workspace_activity: { pin: WORKSPACE_PIN },
  // Time off and public holidays, so it can say who is away and when. The API
  // decides what each person may see.
  list_time_off: { pin: WORKSPACE_PIN },
  list_time_off_requests: { pin: WORKSPACE_PIN },
  list_pending_time_off_requests: { pin: WORKSPACE_PIN },
  get_time_off_request: {},
  get_time_off_balance: { pin: WORKSPACE_PIN },
  list_time_off_balances: { pin: WORKSPACE_PIN },
  list_holiday_countries: { pin: WORKSPACE_PIN },
  get_holiday_calendar: { pin: WORKSPACE_PIN },
  list_holiday_calendar_requests: { pin: WORKSPACE_PIN },
  // Teams, with their members and the linked projects the caller can open.
  list_teams: { pin: WORKSPACE_PIN },
  search: { pin: WORKSPACE_PIN },
  // The ticket lookup scopes itself and never checks the workspace pin, so
  // the pin must always reach it.
  get_task_by_ticket_id: { pin: WORKSPACE_PIN },

  // Projects.
  get_project: {},
  list_project_columns: {},
  list_custom_fields: {},
  // The Resources on the project's Overview.
  list_project_links: {},

  // Tasks, Bugs and Features.
  list_tasks: {},
  get_task: { document: "task_description" },
  get_task_description: { document: "task_description" },
  get_task_custom_fields: {},
  get_task_relations: {},
  list_task_comments: {},
  list_task_external_links: {},
  list_task_time_entries: {},
  get_time_entry: {},
  // Unbounded by default; the full feed can be very long.
  list_task_activity: { defaults: { limit: 50 } },
  list_features: {},
  list_feature_issues: {},
  list_feature_activity: {},
  get_latest_feature_update: {},

  // Milestones and releases.
  list_milestones: {},
  get_milestone: {},
  list_project_milestones: {},
  list_releases: {},
  get_release: {},
  list_release_milestones: {},

  // Project pages and Feature documents.
  list_project_pages: {},
  get_project_page: { document: "project_page" },
  list_feature_documents: {},
  get_feature_document: { document: "feature_document" },

  // Writes: every one runs only after the user approves its card.
  create_project: {
    pin: WORKSPACE_PIN,
    requires: [{ project: ["create"] }],
  },
  update_project_details: { requires: [{ project: ["edit_details"] }] },

  create_task: {
    // The route checks create on the requested type.
    requires: anyWorkItem("create"),
    assignFields: ["userId", "featureComposition.milestones[].leadId"],
    refuse: refuseVirtualStatus,
  },
  update_task: {
    // Descriptions go through update_task_description, which keeps uploads
    // and guards rewrites. Moving between projects and reordering are out of
    // scope.
    omit: ["description", "projectId", "position"],
    requires: anyWorkItem("update"),
    assignFields: ["userId"],
    // A proposal sets the person's zone, so the away check reads their days.
    serverSet: ["timeZone"],
    refuse: refuseVirtualStatus,
  },
  update_task_description: {
    requires: anyWorkItem("update"),
    document: "task_description",
    // A proposal sets it from the current text.
    serverSet: ["expectedDescription"],
  },
  update_task_status: {
    requires: executionUpdate,
    refuse: refuseVirtualStatus,
  },
  update_task_assignee: {
    requires: [{ task: ["assign"] }],
    serverSet: ["timeZone"],
  },
  update_task_estimate: { requires: executionUpdate },
  update_task_due_date: { requires: executionUpdate, serverSet: ["timeZone"] },
  // Converting edits the task and creates the other type.
  set_task_type: {
    requires: [
      { task: ["update"], bug: ["create"] },
      { bug: ["update"], task: ["create"] },
    ],
  },
  set_task_feature: { requires: executionUpdate },
  set_task_milestone: { requires: executionUpdate },
  set_task_release: { requires: executionUpdate },
  set_task_custom_field_value: { requires: anyWorkItem("update") },
  create_task_external_link: { requires: anyWorkItem("update") },
  create_task_comment: { requires: anyWorkItem("update") },
  // The deprecated 'subtask' relation is checked on its Feature source.
  create_task_relation: { requires: anyWorkItem("update") },
  create_time_entry: { requires: executionUpdate },

  create_label: { pin: WORKSPACE_PIN, requires: [{ label: ["create"] }] },
  attach_label_to_task: { requires: [{ label: ["update"] }] },

  create_milestone: {
    requires: [{ milestone: ["create"] }],
    assignFields: ["leadId"],
  },
  update_milestone: {
    requires: [{ milestone: ["update"] }],
    assignFields: ["leadId"],
  },
  create_release: { requires: [{ project: ["update"] }] },
  update_release: { requires: [{ project: ["update"] }] },

  post_feature_update: { requires: featureUpdate },
  create_project_page: { requires: [{ document: ["create"] }] },
  update_project_page: {
    requires: [{ document: ["update"] }],
    document: "project_page",
    // A proposal sets it from the current revision.
    serverSet: ["expectedRevision"],
  },
  create_feature_document: { requires: featureUpdate },
  update_feature_document: {
    requires: featureUpdate,
    document: "feature_document",
    // A proposal sets it from the current revision.
    serverSet: ["expectedRevision"],
  },
};

const TIME_OFF_CHANGES =
  "Time off and holiday calendar changes are made on the Time off page or in Workspace settings → Time off";

/** Registry tools the assistant never offers, with the reason. */
export const EXCLUDED_TOOLS: Record<string, string> = {
  whoami: "The system prompt already names the user",
  list_workspaces: "A chat is pinned to one workspace",
  list_notifications: "Personal inbox, outside the workspace's work",

  delete_task: "Destructive: deletes are out of scope",
  delete_task_comment: "Destructive: deletes are out of scope",
  delete_task_relation: "Destructive: deletes are out of scope",
  delete_label: "Destructive: deletes are out of scope",
  delete_milestone: "Destructive: deletes are out of scope",
  delete_release: "Destructive: deletes are out of scope",

  move_task: "Moves between projects are out of scope",
  duplicate_task: "Bulk copying is out of scope",
  move_unfinished_release_items: "Bulk moves are out of scope",
  reorder_milestones: "Reordering is out of scope",
  archive_feature: "Archiving is out of scope",
  accept_triage_task:
    "Triage decisions belong to the project's triage members in the triage view",
  decline_triage_task: "Declining archives the task; archiving is out of scope",
  // Time off and holiday calendar changes stay in the Time off pages.
  request_time_off: TIME_OFF_CHANGES,
  update_time_off_request: TIME_OFF_CHANGES,
  cancel_time_off_request: TIME_OFF_CHANGES,
  approve_time_off_request: TIME_OFF_CHANGES,
  decline_time_off_request: TIME_OFF_CHANGES,
  set_time_off_allowance: TIME_OFF_CHANGES,
  set_holiday_calendar: TIME_OFF_CHANGES,
  approve_holiday_calendar_request: TIME_OFF_CHANGES,
  decline_holiday_calendar_request: TIME_OFF_CHANGES,
  cancel_holiday_calendar_request: TIME_OFF_CHANGES,
  set_holiday_calendar_deadline: TIME_OFF_CHANGES,
  update_project: "Can make a project public; use update_project_details",
  update_task_comment: "Comment edits delete removed images",
  detach_label_from_task: "Removing is out of scope",
  update_time_entry:
    "Time-entry edits are out of scope; logging new time is allowed",
};

/** The body field of each document read, which compaction never edits. */
export const DOCUMENT_FIELDS: Record<string, string> = {
  get_project_page: "body",
  get_feature_document: "body",
  get_task_description: "content",
  get_task: "description",
};

/** Splits an `assignFields` path: "a.b[].c" → ["a", "b", "[]", "c"]. */
export function fieldPathTokens(path: string): string[] {
  return path
    .split(".")
    .flatMap((part) =>
      part.endsWith("[]") ? [part.slice(0, -2), "[]"] : part,
    );
}
