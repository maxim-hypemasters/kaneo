// A task follows its feature only while both hold the same release, so
// there is no "overridden" flag: these decide the release a task starts
// with, or takes when it joins a feature. Null means no release.

// Creating a task: an explicit release, or null for none, wins. Omitted,
// the task starts in its feature's release (null without a feature).
export function releaseForNewTask(
  requested: string | null | undefined,
  featureRelease: string | null,
) {
  return requested === undefined ? featureRelease : requested;
}

// Joining a feature: a task already in a release keeps it.
export function releaseForJoiningTask(
  taskRelease: string | null,
  featureRelease: string | null,
) {
  return taskRelease ?? featureRelease;
}
