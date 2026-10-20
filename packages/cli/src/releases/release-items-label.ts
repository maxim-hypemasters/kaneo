const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`;

// "3 tasks and 1 milestone", leaving out a kind the release doesn't hold.
export function releaseItemsLabel(tasks: number, milestones: number): string {
  const parts = [
    ...(tasks > 0 ? [plural(tasks, "task")] : []),
    ...(milestones > 0 ? [plural(milestones, "milestone")] : []),
  ];
  return parts.length > 0 ? parts.join(" and ") : "no tasks";
}
