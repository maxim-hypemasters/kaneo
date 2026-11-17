import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";

type Preview = NonNullable<AssistantMessage["preview"]>;

// The write tools the assistant proposes, matching the write entries of
// ASSISTANT_TOOL_CATALOG in apps/api/src/assistant/tools/
// assistant-tool-catalog.ts (proposal-copy.test.ts checks the two agree).
export const WRITE_TOOL_NAMES = [
  "create_project",
  "update_project_details",
  "create_task",
  "update_task",
  "update_task_description",
  "update_task_status",
  "update_task_assignee",
  "update_task_estimate",
  "update_task_due_date",
  "set_task_type",
  "set_task_feature",
  "set_task_milestone",
  "set_task_release",
  "set_task_custom_field_value",
  "create_task_external_link",
  "create_task_comment",
  "create_task_relation",
  "create_time_entry",
  "create_label",
  "attach_label_to_task",
  "create_milestone",
  "update_milestone",
  "create_release",
  "update_release",
  "post_feature_update",
  "create_project_page",
  "update_project_page",
  "create_feature_document",
  "update_feature_document",
] as const;

export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

const TITLE = "workspace:assistant.proposal.title";

// Each title names the change and takes the card's target, the project,
// task, Feature, milestone, release, page or document it is about.
const TITLE_KEYS: Record<WriteToolName, string> = {
  create_project: `${TITLE}.createProject`,
  update_project_details: `${TITLE}.updateProjectDetails`,
  create_task: `${TITLE}.createTask`,
  update_task: `${TITLE}.updateTask`,
  update_task_description: `${TITLE}.updateTaskDescription`,
  update_task_status: `${TITLE}.updateTaskStatus`,
  update_task_assignee: `${TITLE}.updateTaskAssignee`,
  update_task_estimate: `${TITLE}.updateTaskEstimate`,
  update_task_due_date: `${TITLE}.updateTaskDueDate`,
  set_task_type: `${TITLE}.setTaskType`,
  set_task_feature: `${TITLE}.setTaskFeature`,
  set_task_milestone: `${TITLE}.setTaskMilestone`,
  set_task_release: `${TITLE}.setTaskRelease`,
  set_task_custom_field_value: `${TITLE}.setTaskCustomFieldValue`,
  create_task_external_link: `${TITLE}.createTaskExternalLink`,
  create_task_comment: `${TITLE}.createTaskComment`,
  create_task_relation: `${TITLE}.createTaskRelation`,
  create_time_entry: `${TITLE}.createTimeEntry`,
  create_label: `${TITLE}.createLabel`,
  attach_label_to_task: `${TITLE}.attachLabelToTask`,
  create_milestone: `${TITLE}.createMilestone`,
  update_milestone: `${TITLE}.updateMilestone`,
  create_release: `${TITLE}.createRelease`,
  update_release: `${TITLE}.updateRelease`,
  post_feature_update: `${TITLE}.postFeatureUpdate`,
  create_project_page: `${TITLE}.createProjectPage`,
  update_project_page: `${TITLE}.updateProjectPage`,
  create_feature_document: `${TITLE}.createFeatureDocument`,
  update_feature_document: `${TITLE}.updateFeatureDocument`,
};

// create_task makes a Task unless the model asked for a Bug or a Feature.
const CREATE_TYPE_TITLE_KEYS: Record<string, string> = {
  bug: `${TITLE}.createBug`,
  feature: `${TITLE}.createFeature`,
};

export const TITLE_FALLBACK_KEY = `${TITLE}.fallback`;

const FIELD = "workspace:assistant.proposal.field";

// Every argument a card can list, by the name the tools give it.
const FIELD_LABEL_KEYS: Record<string, string> = {
  projectId: `${FIELD}.projectId`,
  taskId: `${FIELD}.taskId`,
  sourceTaskId: `${FIELD}.sourceTaskId`,
  targetTaskId: `${FIELD}.targetTaskId`,
  taskIds: `${FIELD}.taskIds`,
  featureId: `${FIELD}.featureId`,
  milestoneId: `${FIELD}.milestoneId`,
  releaseId: `${FIELD}.releaseId`,
  pageId: `${FIELD}.pageId`,
  parentId: `${FIELD}.parentId`,
  documentId: `${FIELD}.documentId`,
  labelId: `${FIELD}.labelId`,
  fieldId: `${FIELD}.fieldId`,
  userId: `${FIELD}.userId`,
  leadId: `${FIELD}.leadId`,
  name: `${FIELD}.name`,
  title: `${FIELD}.title`,
  slug: `${FIELD}.slug`,
  icon: `${FIELD}.icon`,
  color: `${FIELD}.color`,
  type: `${FIELD}.type`,
  status: `${FIELD}.status`,
  priority: `${FIELD}.priority`,
  health: `${FIELD}.health`,
  relationType: `${FIELD}.relationType`,
  estimateSeconds: `${FIELD}.estimateSeconds`,
  dueDate: `${FIELD}.dueDate`,
  startDate: `${FIELD}.startDate`,
  codeFreezeDate: `${FIELD}.codeFreezeDate`,
  submissionDate: `${FIELD}.submissionDate`,
  startTime: `${FIELD}.startTime`,
  endTime: `${FIELD}.endTime`,
  description: `${FIELD}.description`,
  body: `${FIELD}.body`,
  appendMarkdown: `${FIELD}.appendMarkdown`,
  content: `${FIELD}.content`,
  note: `${FIELD}.note`,
  url: `${FIELD}.url`,
  value: `${FIELD}.value`,
  customFields: `${FIELD}.customFields`,
  // Not an argument: the server's note on work that will wait in Triage.
  triage: `${FIELD}.triage`,
};

export const FIELD_FALLBACK_KEY = `${FIELD}.fallback`;

export const isWriteToolName = (name: string): name is WriteToolName =>
  Object.hasOwn(TITLE_KEYS, name);

/**
 * The i18n key of a card's title, which takes `{{target}}`. Unknown tools
 * and cards without a target get a generic title.
 */
export function proposalTitleKey(
  toolName: string | null,
  preview: Pick<Preview, "target" | "fields"> | null,
): string {
  if (!toolName || !isWriteToolName(toolName) || !preview?.target) {
    return TITLE_FALLBACK_KEY;
  }
  if (toolName === "create_task") {
    const type = preview.fields.find((field) => field.key === "type")?.value;
    if (type && Object.hasOwn(CREATE_TYPE_TITLE_KEYS, type)) {
      return CREATE_TYPE_TITLE_KEYS[type] as string;
    }
  }
  return TITLE_KEYS[toolName];
}

/** The i18n key labelling one of a card's fields. */
export function fieldLabelKey(key: string): string {
  return Object.hasOwn(FIELD_LABEL_KEYS, key)
    ? (FIELD_LABEL_KEYS[key] as string)
    : FIELD_FALLBACK_KEY;
}

/** Every title key, for the copy check. */
export const ALL_TITLE_KEYS: readonly string[] = [
  ...Object.values(TITLE_KEYS),
  ...Object.values(CREATE_TYPE_TITLE_KEYS),
  TITLE_FALLBACK_KEY,
];
