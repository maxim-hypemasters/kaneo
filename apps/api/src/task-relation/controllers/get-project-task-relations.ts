import { and, asc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { projectFeatureLinks } from "../feature-links";

const sourceTask = alias(taskTable, "source_task");
const targetTask = alias(taskTable, "target_task");

// Both ends must be in the project, so relations into other projects (which the
// caller may not be allowed to see) never leave this endpoint. "subtask"
// relations are feature links now, read from the tasks (see feature-links.ts).
async function getProjectTaskRelations(
  projectId: string,
  relationType?: "subtask" | "blocks" | "related",
) {
  const featureLinks =
    relationType === undefined || relationType === "subtask"
      ? (await projectFeatureLinks(projectId)).map(
          ({ createdAt: _createdAt, ...link }) => link,
        )
      : [];
  if (relationType === "subtask") return featureLinks;
  const relations = await db
    .select({
      id: taskRelationTable.id,
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
      relationType: taskRelationTable.relationType,
    })
    .from(taskRelationTable)
    .innerJoin(sourceTask, eq(sourceTask.id, taskRelationTable.sourceTaskId))
    .innerJoin(targetTask, eq(targetTask.id, taskRelationTable.targetTaskId))
    .where(
      and(
        eq(sourceTask.projectId, projectId),
        eq(targetTask.projectId, projectId),
        relationType
          ? eq(taskRelationTable.relationType, relationType)
          : ne(taskRelationTable.relationType, "subtask"),
      ),
    )
    .orderBy(asc(taskRelationTable.createdAt), asc(taskRelationTable.id));
  return [...relations, ...featureLinks];
}

export default getProjectTaskRelations;
