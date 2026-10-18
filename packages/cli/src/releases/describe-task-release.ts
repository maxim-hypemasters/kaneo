// "release 2.4", "no release", and how many of a feature's tasks moved along.
export function describeTaskRelease(
  name: string | null,
  followers: number,
): string {
  const release = name === null ? "no release" : `release ${name}`;
  if (followers === 0) return release;
  return `${release}, with ${followers} ${followers === 1 ? "task" : "tasks"} of the feature`;
}
