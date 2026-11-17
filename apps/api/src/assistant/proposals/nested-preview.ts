import type {
  AssistantNestedMilestone,
  AssistantNestedTask,
  AssistantProposalPreview,
} from "../message-types";

type Nested = NonNullable<AssistantProposalPreview["nested"]>;
type Json = Record<string, unknown>;

/** The name of an id argument: a task's "KAN-12 Title", a member, a release. */
export type NestedLabel = (key: string, id: string) => Promise<string>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const records = (value: unknown): Json[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const text = (value: unknown) => (typeof value === "string" ? value : "");

async function labelOf(
  key: string,
  value: unknown,
  label: NestedLabel,
): Promise<string | null> {
  return typeof value === "string" && value !== "" ? label(key, value) : null;
}

function draft(task: Json): AssistantNestedTask {
  return {
    title: text(task.title),
    type: task.type === "task" || task.type === "bug" ? task.type : null,
    estimateSeconds:
      typeof task.estimateSeconds === "number" ? task.estimateSeconds : null,
    existing: false,
  };
}

async function milestoneOf(
  milestone: Json,
  tasks: AssistantNestedTask[],
  label: NestedLabel,
): Promise<AssistantNestedMilestone> {
  return {
    title: text(milestone.title),
    leadLabel: await labelOf("leadId", milestone.leadId, label),
    releaseLabel: await labelOf("releaseId", milestone.releaseId, label),
    priority:
      typeof milestone.priority === "string" ? milestone.priority : null,
    tasks,
  };
}

/**
 * The work a card creates or links along with its entity, with everything
 * the change writes for it: a new Feature's milestones (lead, release and
 * priority) with their tasks, the tasks outside any milestone and the
 * release new ones join; or a new milestone's task drafts. Drafts show
 * their title, type and estimate, existing work its label. Null when the
 * change creates no nested work.
 */
export async function nestedPreview(
  toolName: string,
  args: Json,
  label: NestedLabel,
): Promise<Nested | null> {
  if (toolName === "create_milestone") {
    const drafts = records(args.newTasks).map(draft);
    if (drafts.length === 0) return null;
    // The card's fields already show this milestone's lead, release and
    // priority, so the nested row only lists the work it creates.
    const milestone = await milestoneOf(args, drafts, label);
    return {
      milestones: [
        { ...milestone, leadLabel: null, releaseLabel: null, priority: null },
      ],
      tasks: [],
      unassignedReleaseLabel: null,
    };
  }
  if (toolName !== "create_task" || !isRecord(args.featureComposition))
    return null;

  const composition = args.featureComposition;
  const work = [
    ...records(composition.newTasks).map((task) => ({
      key: task.milestoneKey,
      task: Promise.resolve(draft(task)),
    })),
    ...records(composition.existingTasks).map((task) => ({
      key: task.milestoneKey,
      task: label("taskId", text(task.id)).then(
        (title): AssistantNestedTask => ({
          title,
          type: null,
          estimateSeconds: null,
          existing: true,
        }),
      ),
    })),
  ];
  const milestones = records(composition.milestones);
  const keys = new Set(milestones.map((milestone) => milestone.key));
  const tasksWhere = (match: (key: unknown) => boolean) =>
    Promise.all(
      work.filter((item) => match(item.key)).map((item) => item.task),
    );

  const nested: Nested = {
    milestones: await Promise.all(
      milestones.map(async (milestone) =>
        milestoneOf(
          milestone,
          await tasksWhere((key) => key === milestone.key),
          label,
        ),
      ),
    ),
    tasks: await tasksWhere((key) => typeof key !== "string" || !keys.has(key)),
    unassignedReleaseLabel: await labelOf(
      "releaseId",
      composition.unassignedReleaseId,
      label,
    ),
  };
  return nested.milestones.length === 0 && nested.tasks.length === 0
    ? null
    : nested;
}
