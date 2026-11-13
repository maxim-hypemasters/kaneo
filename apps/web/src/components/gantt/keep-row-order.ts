type OrderedTask = { id: string; scheduleStart: Date };

// Rows open in start-date order and then hold still: a bar that is moved or
// resized keeps its row until the page is reloaded. `tasks` comes in
// start-date order; tasks the last layout had keep its order, and a new one
// goes in before the first of them that starts later.
export function keepRowOrder<Task extends OrderedTask>(
  tasks: readonly Task[],
  previousIds: readonly string[] | undefined,
): Task[] {
  if (!previousIds) return [...tasks];
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const kept = previousIds.flatMap((id) => tasksById.get(id) ?? []);
  const keptIds = new Set(previousIds);
  const added = tasks.filter((task) => !keptIds.has(task.id));

  const ordered: Task[] = [];
  let next = 0;
  for (const task of kept) {
    while (
      next < added.length &&
      added[next]!.scheduleStart.getTime() < task.scheduleStart.getTime()
    )
      ordered.push(added[next++]!);
    ordered.push(task);
  }
  return ordered.concat(added.slice(next));
}
