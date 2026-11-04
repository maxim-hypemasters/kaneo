import type { PlanningTask } from "./types";

export function dependencyCycles(
  ids: string[],
  successors: Map<string, Set<string>>,
) {
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const id of ids) {
    if (visited.has(id)) continue;
    visited.add(id);
    const stack: { id: string; children: string[]; index: number }[] = [
      { id, children: [...(successors.get(id) ?? [])], index: 0 },
    ];
    while (stack.length) {
      const frame = stack.at(-1)!;
      const child = frame.children[frame.index++];
      if (child === undefined) {
        finished.push(frame.id);
        stack.pop();
      } else if (!visited.has(child)) {
        visited.add(child);
        stack.push({
          id: child,
          children: [...(successors.get(child) ?? [])],
          index: 0,
        });
      }
    }
  }
  const predecessors = new Map<string, string[]>();
  for (const [id, children] of successors) {
    for (const child of children) {
      const parents = predecessors.get(child) ?? [];
      parents.push(id);
      predecessors.set(child, parents);
    }
  }
  visited.clear();
  const cyclic = new Set<string>();
  for (const id of finished.reverse()) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const item = stack.pop()!;
      component.push(item);
      for (const parent of predecessors.get(item) ?? []) {
        if (!visited.has(parent)) {
          visited.add(parent);
          stack.push(parent);
        }
      }
    }
    if (component.length > 1 || successors.get(id)?.has(id)) {
      for (const member of component) cyclic.add(member);
    }
  }
  return cyclic;
}

const priorities: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function inheritedUrgency(
  tasks: PlanningTask[],
  blockers: Map<string, Set<string>>,
) {
  const urgency = new Map(
    tasks.map((task) => [
      task.id,
      (task.state === "active" ? 0 : 5) +
        (priorities[task.priority ?? ""] ?? 4),
    ]),
  );
  const queue = tasks.map((task) => task.id);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    for (const blocker of blockers.get(id) ?? []) {
      if (urgency.has(blocker) && urgency.get(id)! < urgency.get(blocker)!) {
        urgency.set(blocker, urgency.get(id)!);
        queue.push(blocker);
      }
    }
  }
  return urgency;
}
