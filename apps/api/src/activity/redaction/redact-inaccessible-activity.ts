import { findAccessibleProjects } from "../../project-access/find-accessible-projects";
import { eventDataOf } from "./event-data";
import { legacyFeatureProjects } from "./legacy-feature-projects";
import {
  featureChangeProjects,
  redactFeatureChange,
} from "./redact-feature-change";
import { moveProjectIds, redactMove } from "./redact-move";
import {
  redactReleaseChange,
  releaseChangeProjectIds,
} from "./redact-release-change";

type ActivityRow = { type: string; taskId: string; eventData: unknown };
type CurrentProjects = ReadonlyMap<string, string>;

function projectIdsOf(row: ActivityRow, currentProjects: CurrentProjects) {
  const data = eventDataOf(row.eventData);
  if (!data) return [];
  if (row.type === "moved") return moveProjectIds(data);
  if (row.type === "release_changed" || row.type === "milestone_changed")
    return releaseChangeProjectIds(data);
  if (row.type === "feature_changed") {
    const projects = featureChangeProjects(data, row.taskId, currentProjects);
    return [projects.old, projects.new].filter(
      (id): id is string => id !== null,
    );
  }
  return [];
}

function redactRow<T extends ActivityRow>(
  row: T,
  currentProjects: CurrentProjects,
  isVisible: (projectId: string) => boolean,
): T {
  const data = eventDataOf(row.eventData);
  if (!data) return row;
  let redacted = data;
  if (row.type === "moved") redacted = redactMove(data, isVisible);
  if (row.type === "release_changed") {
    redacted = redactReleaseChange(data, isVisible);
  }
  if (row.type === "milestone_changed") {
    const projectId =
      typeof data.projectId === "string" ? data.projectId : null;
    if (!projectId || !isVisible(projectId))
      redacted = {
        ...data,
        projectId: null,
        oldMilestoneTitle: null,
        newMilestoneTitle: null,
      };
  }
  if (row.type === "feature_changed") {
    const projects = featureChangeProjects(data, row.taskId, currentProjects);
    redacted = redactFeatureChange(data, projects, isVisible);
  }
  return redacted === data ? row : { ...row, eventData: redacted };
}

// Activity stays with a task when it moves, so its events can name projects,
// and features and releases of projects, the viewer can't see. Those names are hidden;
// a row with nothing to hide comes back as the same object.
export async function redactInaccessibleActivity<T extends ActivityRow>(
  viewerId: string,
  rows: T[],
): Promise<T[]> {
  const currentProjects = await legacyFeatureProjects(rows);
  const visible = await findAccessibleProjects(
    viewerId,
    rows.flatMap((row) => projectIdsOf(row, currentProjects)),
  );
  const isVisible = (projectId: string) => visible.has(projectId);
  return rows.map((row) => redactRow(row, currentProjects, isVisible));
}
