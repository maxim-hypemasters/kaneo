import { entityPaths } from "./entity-paths";
import type { IdLabels } from "./id-labels";

type Json = Record<string, unknown>;

/**
 * What waits in Triage when a proposal runs: the Task or Bug it creates
 * ("self"), the new Tasks and Bugs a Feature or milestone brings along
 * ("nested"), or nothing (null).
 */
export type TriageRouting = "self" | "nested" | null;

export type TriageRoutingResult =
  | { ok: true; routing: TriageRouting }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const records = (value: unknown): Json[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : null;

type NewWork = {
  scope: "self" | "nested";
  projectId: string | null;
  /** The Feature a new milestone joins, when the project isn't named. */
  featureId: string | null;
};

/**
 * The new Tasks and Bugs a proposal creates, which triage routes, and the
 * project they land in. A Feature never waits in Triage itself.
 */
function newWork(toolName: string, args: Json): NewWork | null {
  const nested = (
    drafts: unknown,
    where: Pick<NewWork, "projectId" | "featureId">,
  ): NewWork | null =>
    records(drafts).length === 0 ? null : { scope: "nested", ...where };

  if (toolName === "create_task") {
    const projectId = text(args.projectId);
    if (args.type !== "feature")
      return { scope: "self", projectId, featureId: null };
    const composition = isRecord(args.featureComposition)
      ? args.featureComposition
      : {};
    return nested(composition.newTasks, { projectId, featureId: null });
  }
  if (toolName === "create_milestone")
    return nested(args.newTasks, {
      projectId: null,
      featureId: text(args.featureId),
    });
  return null;
}

function unreadable(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `Couldn't read the project's triage members (${detail.slice(0, 300)}), so nothing was proposed. Look the project or Feature up again and use its exact id.`;
}

/**
 * Whether the new Tasks and Bugs a proposal creates would wait in Triage,
 * by the rule the API applies when it runs as `userId` (routeNewWork): the
 * project has triage members and the user isn't one. The members are read
 * as the user.
 */
export async function triageRouting(input: {
  toolName: string;
  args: Json;
  labels: IdLabels;
  userId: string;
}): Promise<TriageRoutingResult> {
  const work = newWork(input.toolName, input.args);
  if (!work) return { ok: true, routing: null };
  try {
    const projectId =
      work.projectId ??
      (work.featureId
        ? ((await input.labels.task(work.featureId))?.projectId ?? null)
        : null);
    if (!projectId) return { ok: false, error: unreadable("no project") };
    const members = await input.labels.load(
      entityPaths.triageMembers(projectId),
    );
    const memberIds =
      isRecord(members) && Array.isArray(members.userIds)
        ? members.userIds
        : null;
    if (!memberIds) return { ok: false, error: unreadable("no member list") };
    const waits = memberIds.length > 0 && !memberIds.includes(input.userId);
    return { ok: true, routing: waits ? work.scope : null };
  } catch (error) {
    return { ok: false, error: unreadable(error) };
  }
}
