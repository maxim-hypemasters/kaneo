// The read tools the assistant runs on its own, matching the read entries of
// ASSISTANT_TOOL_CATALOG in apps/api/src/assistant/tools/
// assistant-tool-catalog.ts (tool-label.test.ts checks the two agree).
export const READ_TOOL_NAMES = [
  "list_projects",
  "list_workspace_members",
  "list_workspace_labels",
  "list_my_tasks",
  "list_workspace_activity",
  "list_time_off",
  "list_time_off_requests",
  "list_pending_time_off_requests",
  "get_time_off_request",
  "get_time_off_balance",
  "list_time_off_balances",
  "list_holiday_countries",
  "get_holiday_calendar",
  "list_holiday_calendar_requests",
  "list_teams",
  "search",
  "get_task_by_ticket_id",
  "get_project",
  "list_project_columns",
  "list_custom_fields",
  "list_tasks",
  "get_task",
  "get_task_description",
  "get_task_custom_fields",
  "get_task_relations",
  "list_task_comments",
  "list_task_external_links",
  "list_task_time_entries",
  "get_time_entry",
  "list_task_activity",
  "list_features",
  "list_feature_issues",
  "list_feature_activity",
  "get_latest_feature_update",
  "list_milestones",
  "get_milestone",
  "list_project_milestones",
  "list_releases",
  "get_release",
  "list_release_milestones",
  "list_test_cases",
  "list_feature_test_cases",
  "list_release_test_cases",
  "get_test_case",
  "list_test_case_comments",
  "list_project_pages",
  "get_project_page",
  "list_feature_documents",
  "get_feature_document",
] as const;

export type ReadToolName = (typeof READ_TOOL_NAMES)[number];

const READ_TOOL_LABEL_KEYS: Record<ReadToolName, string> = {
  list_projects: "workspace:assistant.tools.listProjects",
  list_workspace_members: "workspace:assistant.tools.listWorkspaceMembers",
  list_workspace_labels: "workspace:assistant.tools.listWorkspaceLabels",
  list_my_tasks: "workspace:assistant.tools.listMyTasks",
  list_workspace_activity: "workspace:assistant.tools.listWorkspaceActivity",
  list_time_off: "workspace:assistant.tools.listTimeOff",
  list_time_off_requests: "workspace:assistant.tools.listTimeOffRequests",
  list_pending_time_off_requests:
    "workspace:assistant.tools.listPendingTimeOffRequests",
  get_time_off_request: "workspace:assistant.tools.getTimeOffRequest",
  get_time_off_balance: "workspace:assistant.tools.getTimeOffBalance",
  list_time_off_balances: "workspace:assistant.tools.listTimeOffBalances",
  list_holiday_countries: "workspace:assistant.tools.listHolidayCountries",
  get_holiday_calendar: "workspace:assistant.tools.getHolidayCalendar",
  list_holiday_calendar_requests:
    "workspace:assistant.tools.listHolidayCalendarRequests",
  list_teams: "workspace:assistant.tools.listTeams",
  search: "workspace:assistant.tools.search",
  get_task_by_ticket_id: "workspace:assistant.tools.getTaskByTicketId",
  get_project: "workspace:assistant.tools.getProject",
  list_project_columns: "workspace:assistant.tools.listProjectColumns",
  list_custom_fields: "workspace:assistant.tools.listCustomFields",
  list_tasks: "workspace:assistant.tools.listTasks",
  get_task: "workspace:assistant.tools.getTask",
  get_task_description: "workspace:assistant.tools.getTaskDescription",
  get_task_custom_fields: "workspace:assistant.tools.getTaskCustomFields",
  get_task_relations: "workspace:assistant.tools.getTaskRelations",
  list_task_comments: "workspace:assistant.tools.listTaskComments",
  list_task_external_links: "workspace:assistant.tools.listTaskExternalLinks",
  list_task_time_entries: "workspace:assistant.tools.listTaskTimeEntries",
  get_time_entry: "workspace:assistant.tools.getTimeEntry",
  list_task_activity: "workspace:assistant.tools.listTaskActivity",
  list_features: "workspace:assistant.tools.listFeatures",
  list_feature_issues: "workspace:assistant.tools.listFeatureIssues",
  list_feature_activity: "workspace:assistant.tools.listFeatureActivity",
  get_latest_feature_update: "workspace:assistant.tools.getLatestFeatureUpdate",
  list_milestones: "workspace:assistant.tools.listMilestones",
  get_milestone: "workspace:assistant.tools.getMilestone",
  list_project_milestones: "workspace:assistant.tools.listProjectMilestones",
  list_releases: "workspace:assistant.tools.listReleases",
  get_release: "workspace:assistant.tools.getRelease",
  list_release_milestones: "workspace:assistant.tools.listReleaseMilestones",
  list_test_cases: "workspace:assistant.tools.listTestCases",
  list_feature_test_cases: "workspace:assistant.tools.listFeatureTestCases",
  list_release_test_cases: "workspace:assistant.tools.listReleaseTestCases",
  get_test_case: "workspace:assistant.tools.getTestCase",
  list_test_case_comments: "workspace:assistant.tools.listTestCaseComments",
  list_project_pages: "workspace:assistant.tools.listProjectPages",
  get_project_page: "workspace:assistant.tools.getProjectPage",
  list_feature_documents: "workspace:assistant.tools.listFeatureDocuments",
  get_feature_document: "workspace:assistant.tools.getFeatureDocument",
};

const FALLBACK_LABEL_KEY = "workspace:assistant.tools.fallback";

const isReadToolName = (name: string): name is ReadToolName =>
  Object.hasOwn(READ_TOOL_LABEL_KEYS, name);

/** The i18n key naming what a tool step looked at. */
export function toolLabelKey(name: string | null): string {
  return name && isReadToolName(name)
    ? READ_TOOL_LABEL_KEYS[name]
    : FALLBACK_LABEL_KEY;
}
