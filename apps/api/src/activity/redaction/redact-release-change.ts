import type { EventData } from "./event-data";

const NAMES = ["oldReleaseName", "newReleaseName"] as const;

// A "release_changed" event stores the task's project at the time, which
// held both releases.
export function releaseChangeProjectIds(data: EventData) {
  return typeof data.projectId === "string" ? [data.projectId] : [];
}

// Hides the release names, and the project, from a viewer who can't see that
// project; names whose project can't be told are hidden from everyone. Ids
// stay so the event still reads as joining or leaving a release. Returns
// data itself when nothing is hidden.
export function redactReleaseChange(
  data: EventData,
  isVisible: (projectId: string) => boolean,
): EventData {
  const projectId = typeof data.projectId === "string" ? data.projectId : null;
  if (projectId && isVisible(projectId)) return data;
  const hidden: EventData = projectId ? { projectId: null } : {};
  for (const key of NAMES) {
    if (data[key] != null) hidden[key] = null;
  }
  return Object.keys(hidden).length > 0 ? { ...data, ...hidden } : data;
}
