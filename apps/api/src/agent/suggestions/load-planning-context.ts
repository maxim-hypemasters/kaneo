import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { PlanningContext } from "../../agent-runner/response";
import db from "../../database";
import {
  milestoneTable,
  releaseTable,
  taskAgentAssessmentTable,
  taskTable,
} from "../../database/schema";
import type { AgentTask } from "../controllers/load-agent-task";
import { countTargetTestCases } from "./count-target-test-cases";
import { loadPlanningPeople } from "./load-planning-people";
import { missingFields, testCaseTarget } from "./missing-fields";

const FEATURE_LIMIT = 50;
const MILESTONES_PER_FEATURE = 20;
const RELEASE_LIMIT = 20;

type Feature = PlanningContext["features"][number];

// Live features of the project, newest first, or just the given one.
async function loadFeatures(
  projectId: string,
  featureId: string | null,
): Promise<Feature[]> {
  const features = await db
    .select({ id: taskTable.id, title: taskTable.title })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskTable.type, "feature"),
        featureId ? eq(taskTable.id, featureId) : isNull(taskTable.archivedAt),
      ),
    )
    .orderBy(desc(taskTable.createdAt), asc(taskTable.id))
    .limit(FEATURE_LIMIT);
  if (!features.length) return [];
  const milestones = await db
    .select({
      id: milestoneTable.id,
      title: milestoneTable.title,
      featureId: milestoneTable.featureId,
    })
    .from(milestoneTable)
    .where(
      inArray(
        milestoneTable.featureId,
        features.map((feature) => feature.id),
      ),
    )
    .orderBy(asc(milestoneTable.position), asc(milestoneTable.id));
  return features.map((feature) => ({
    ...feature,
    milestones: milestones
      .filter((milestone) => milestone.featureId === feature.id)
      .slice(0, MILESTONES_PER_FEATURE)
      .map(({ id, title }) => ({ id, title })),
  }));
}

/**
 * What the model may fill in on an assess run: the task's empty fields that
 * nobody dismissed, and the candidates for each. Lists cover only the fields
 * asked for; people come with names, never emails.
 */
export async function loadPlanningContext(
  task: AgentTask["task"],
): Promise<PlanningContext> {
  const today = new Date().toISOString().slice(0, 10);
  const [features, releases, testCases, assessment] = await Promise.all([
    loadFeatures(task.projectId, task.featureId),
    db
      .select({
        id: releaseTable.id,
        name: releaseTable.name,
        submissionDate: releaseTable.submissionDate,
      })
      .from(releaseTable)
      .where(
        and(
          eq(releaseTable.projectId, task.projectId),
          gte(releaseTable.submissionDate, today),
        ),
      )
      .orderBy(asc(releaseTable.submissionDate), asc(releaseTable.id))
      .limit(RELEASE_LIMIT),
    countTargetTestCases(task),
    db
      .select({ dismissed: taskAgentAssessmentTable.dismissedSuggestionKinds })
      .from(taskAgentAssessmentTable)
      .where(eq(taskAgentAssessmentTable.taskId, task.id))
      .limit(1),
  ]);
  const dismissed = assessment[0]?.dismissed ?? [];
  const missing = missingFields({
    task,
    hasFeatures: features.length > 0,
    featureHasMilestones: features.some(
      (feature) => feature.id === task.featureId && feature.milestones.length,
    ),
    hasReleases: releases.length > 0,
    testCases,
  }).filter((kind) => !dismissed.includes(kind));
  const asks = (kind: (typeof missing)[number]) => missing.includes(kind);

  return {
    missing,
    estimateDayMinutes: task.estimateDayMinutes,
    people: asks("assignee")
      ? await loadPlanningPeople({
          workspaceId: task.workspaceId,
          projectId: task.projectId,
        })
      : [],
    features: asks("feature") || asks("milestone") ? features : [],
    releases: asks("release") ? releases : [],
    testCaseTarget: asks("test_cases") ? testCaseTarget(task) : null,
  };
}
