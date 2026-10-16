import type { EventData } from "./event-data";

const SIDES = ["old", "new"] as const;
type Side = (typeof SIDES)[number];

// The project whose feature each side of a "feature_changed" event names, or
// null when that can't be told. Newer events store the task's project at the
// time, which held both features. Older ones don't, so their feature counts
// as in the task's current project only while it still is; currentProjects
// maps the task and those features to where they are now.
export function featureChangeProjects(
  data: EventData,
  taskId: string,
  currentProjects: ReadonlyMap<string, string>,
): Record<Side, string | null> {
  const stored = typeof data.projectId === "string" ? data.projectId : null;
  const taskProject = currentProjects.get(taskId);
  const projectOf = (side: Side) => {
    if (stored) return stored;
    const featureId = data[`${side}FeatureId`];
    const featureProject =
      typeof featureId === "string" ? currentProjects.get(featureId) : null;
    return featureProject && featureProject === taskProject
      ? featureProject
      : null;
  };
  return { old: projectOf("old"), new: projectOf("new") };
}

// Hides the feature titles, and the stored project, the viewer can't see.
// Ids stay so the event still reads as joining or leaving a feature. Returns
// data itself when nothing is hidden.
export function redactFeatureChange(
  data: EventData,
  projects: Record<Side, string | null>,
  isVisible: (projectId: string) => boolean,
): EventData {
  const hidden: EventData = {};
  if (typeof data.projectId === "string" && !isVisible(data.projectId)) {
    hidden.projectId = null;
  }
  for (const side of SIDES) {
    const key = `${side}FeatureTitle`;
    const projectId = projects[side];
    if (data[key] != null && !(projectId && isVisible(projectId))) {
      hidden[key] = null;
    }
  }
  return Object.keys(hidden).length > 0 ? { ...data, ...hidden } : data;
}
