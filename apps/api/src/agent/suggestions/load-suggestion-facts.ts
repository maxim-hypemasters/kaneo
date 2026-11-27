import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
import {
  milestoneTable,
  releaseTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { filterUsersWithProjectAccess } from "../../project-access/filter-users-with-project-access";
import { filterAssignableUsers } from "../../utils/assert-assignable-user";
import type { PermissionMap } from "../../utils/role-permissions";
import type { ReadinessSuggestion } from "../agent-types";
import type { AgentTask } from "../controllers/load-agent-task";
import { countTargetTestCases } from "./count-target-test-cases";
import type { SuggestionFacts } from "./visible-suggestions";

export type PermissionCheck = (permissions: PermissionMap) => boolean;

const idsOf = (values: ReadonlyArray<string | null>) => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

async function loadAssignable(task: AgentTask["task"], userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const [members, withAccess] = await Promise.all([
    filterAssignableUsers(userIds, task.workspaceId),
    filterUsersWithProjectAccess(userIds, task.projectId),
  ]);
  const ids = userIds.filter((id) => members.has(id) && withAccess.has(id));
  if (!ids.length) return new Map<string, string>();
  const rows = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
    .where(inArray(userTable.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function loadFeatures(projectId: string, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db
    .select({ id: taskTable.id, title: taskTable.title })
    .from(taskTable)
    .where(
      and(
        inArray(taskTable.id, ids),
        eq(taskTable.projectId, projectId),
        eq(taskTable.type, "feature"),
        isNull(taskTable.archivedAt),
      ),
    );
  return new Map(rows.map((row) => [row.id, row.title]));
}

async function loadMilestones(projectId: string, ids: string[]) {
  if (!ids.length) return new Map<string, never>();
  const feature = alias(taskTable, "feature");
  const rows = await db
    .select({
      id: milestoneTable.id,
      title: milestoneTable.title,
      featureId: milestoneTable.featureId,
    })
    .from(milestoneTable)
    .innerJoin(feature, eq(milestoneTable.featureId, feature.id))
    .where(
      and(inArray(milestoneTable.id, ids), eq(feature.projectId, projectId)),
    );
  return new Map(
    rows.map((row) => [row.id, { title: row.title, featureId: row.featureId }]),
  );
}

async function loadReleases(projectId: string, ids: string[]) {
  if (!ids.length) return new Map<string, never>();
  const rows = await db
    .select({
      id: releaseTable.id,
      name: releaseTable.name,
      submissionDate: releaseTable.submissionDate,
    })
    .from(releaseTable)
    .where(
      and(inArray(releaseTable.id, ids), eq(releaseTable.projectId, projectId)),
    );
  return new Map(
    rows.map((row) => [
      row.id,
      { name: row.name, submissionDate: row.submissionDate },
    ]),
  );
}

/**
 * Reads what the suggestions point at, as it is now and as the viewer may
 * see it. Loads only what the given suggestions need.
 */
export async function loadSuggestionFacts(
  task: AgentTask["task"],
  suggestions: readonly ReadinessSuggestion[],
  dismissedKinds: readonly string[],
  can: PermissionCheck,
): Promise<SuggestionFacts> {
  const pick = <K extends NonNullable<ReadinessSuggestion["kind"]>>(kind: K) =>
    suggestions.filter(
      (item): item is Extract<ReadinessSuggestion, { kind: K }> =>
        item.kind === kind,
    );
  const features = pick("feature");
  const [assignable, featureTitles, milestones, releases, testCases] =
    await Promise.all([
      loadAssignable(task, idsOf(pick("assignee").map((item) => item.userId))),
      loadFeatures(
        task.projectId,
        idsOf(features.map((item) => item.featureId)),
      ),
      loadMilestones(
        task.projectId,
        idsOf([
          ...features.map((item) => item.milestoneId),
          ...pick("milestone").map((item) => item.milestoneId),
          ...pick("test_cases").map((item) => item.milestoneId),
        ]),
      ),
      loadReleases(
        task.projectId,
        idsOf(pick("release").map((item) => item.releaseId)),
      ),
      pick("test_cases").length ? countTargetTestCases(task) : 0,
    ]);
  return {
    task,
    dismissedKinds,
    assignable,
    features: featureTitles,
    milestones,
    releases,
    testCases,
    can: {
      features: can({ feature: ["read"] }),
      milestones: can({ milestone: ["read"] }),
      testCases: can({ test_case: ["read"] }),
    },
  };
}
