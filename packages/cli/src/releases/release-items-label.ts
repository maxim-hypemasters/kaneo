const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`;

// "3 tasks and 1 feature", leaving out a kind the release doesn't hold.
export function releaseItemsLabel(tasks: number, features: number): string {
  const parts = [
    ...(tasks > 0 ? [plural(tasks, "task")] : []),
    ...(features > 0 ? [plural(features, "feature")] : []),
  ];
  return parts.length > 0 ? parts.join(" and ") : "no tasks";
}
