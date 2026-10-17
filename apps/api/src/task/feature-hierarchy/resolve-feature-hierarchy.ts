// Turns legacy "subtask" relations into the two-level Feature / Task
// hierarchy, one project at a time. Shared by the startup migration and the
// import writer, so both flatten the same way.

export type HierarchyTask = {
  id: string;
  type: string;
  featureId: string | null;
};

export type SubtaskEdge = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  createdAt: Date;
};

// "membership": the target joins the source's feature, so the row goes away.
// "related": the row stays as a plain related link.
// "dropped": another row already says the same, so this one goes away.
export type SubtaskEdgeOutcome = "membership" | "related" | "dropped";

export type FeatureHierarchyPlan = {
  // Plain tasks that become features.
  features: string[];
  // Tasks without a feature that join one: task id -> feature id.
  memberships: Map<string, string>;
  outcomes: Map<string, SubtaskEdgeOutcome>;
};

export const pairKey = (left: string, right: string) =>
  left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;

const byAge = (left: SubtaskEdge, right: SubtaskEdge) =>
  left.createdAt.getTime() - right.createdAt.getTime() ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

// `tasks` are the project's tasks; `edges` are the subtask rows whose source
// is in the project (a target elsewhere is a cross-project link). What the
// database already says wins: existing features stay roots, existing
// memberships stay put, and a feature never becomes a member.
//
// Each task joins the feature at the end of its shallowest path, ties going
// to the oldest link, so Epic -> Story -> Sub-task leaves both the story and
// the sub-task in the epic. Links that don't become a membership (deeper
// levels, extra parents, cross-project, loops) are kept as related links,
// once per pair.
export function resolveFeatureHierarchy({
  tasks,
  edges,
  relatedPairs,
}: {
  tasks: readonly HierarchyTask[];
  edges: readonly SubtaskEdge[];
  // Unordered pairs (see pairKey) that already have a related link.
  relatedPairs: ReadonlySet<string>;
}): FeatureHierarchyPlan {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const outcomes = new Map<string, SubtaskEdgeOutcome>();
  const keptPairs = new Set<string>();
  const inProject: SubtaskEdge[] = [];

  for (const edge of [...edges].sort(byAge)) {
    const key = pairKey(edge.sourceTaskId, edge.targetTaskId);
    if (edge.sourceTaskId === edge.targetTaskId || keptPairs.has(key)) {
      outcomes.set(edge.id, "dropped");
      continue;
    }
    keptPairs.add(key);
    if (taskById.has(edge.sourceTaskId) && taskById.has(edge.targetTaskId)) {
      inProject.push(edge);
    } else {
      outcomes.set(edge.id, relatedPairs.has(key) ? "dropped" : "related");
    }
  }

  const isFeature = (id: string) => taskById.get(id)?.type === "feature";
  const existingFeatureOf = (id: string) => taskById.get(id)?.featureId ?? null;

  // A task's feature once resolved, and the edge that put it there.
  const featureOf = new Map<string, string>();
  const viaEdge = new Map<string, string>();
  for (const task of tasks) {
    if (task.featureId && isFeature(task.featureId)) {
      featureOf.set(task.id, task.featureId);
    }
  }

  const children = new Map<string, SubtaskEdge[]>();
  const isChild = new Set<string>();
  for (const edge of inProject) {
    const list = children.get(edge.sourceTaskId) ?? [];
    list.push(edge);
    children.set(edge.sourceTaskId, list);
    isChild.add(edge.targetTaskId);
  }

  const roots = new Set<string>();
  for (const task of tasks) {
    if (task.type === "feature") roots.add(task.id);
  }
  for (const source of children.keys()) {
    const task = taskById.get(source);
    if (
      task &&
      task.type !== "feature" &&
      !existingFeatureOf(source) &&
      !isChild.has(source)
    ) {
      roots.add(source);
    }
  }

  // Breadth-first from every root at once: depth 1 first (the root's own
  // links, then existing members), then deeper. Within a depth, the oldest
  // link wins.
  const claimable = (id: string) =>
    !roots.has(id) && !isFeature(id) && !featureOf.has(id);
  const rootOf = (id: string) => (roots.has(id) ? id : featureOf.get(id));
  const existingMembers = [...featureOf.keys()];
  let frontier = [...roots];
  const seen = new Set(frontier);
  for (let depth = 0; frontier.length > 0; depth++) {
    const candidates = frontier
      .flatMap((id) => children.get(id) ?? [])
      .sort(byAge);
    const next: string[] = [];
    for (const edge of candidates) {
      const child = edge.targetTaskId;
      const root = rootOf(edge.sourceTaskId);
      if (!root || !claimable(child)) continue;
      featureOf.set(child, root);
      viaEdge.set(child, edge.id);
      if (!seen.has(child)) {
        seen.add(child);
        next.push(child);
      }
    }
    // Existing members sit one level below their feature.
    if (depth === 0) {
      for (const id of existingMembers) {
        if (!seen.has(id)) {
          seen.add(id);
          next.push(id);
        }
      }
    }
    frontier = next;
  }

  const features: string[] = [];
  const hasMembers = new Set(featureOf.values());
  for (const root of roots) {
    if (!isFeature(root) && hasMembers.has(root)) features.push(root);
  }

  const memberships = new Map<string, string>();
  for (const [taskId, featureId] of featureOf) {
    if (!existingFeatureOf(taskId)) memberships.set(taskId, featureId);
  }

  for (const edge of inProject) {
    const child = edge.targetTaskId;
    const membership =
      viaEdge.get(child) === edge.id &&
      featureOf.get(child) === edge.sourceTaskId;
    if (membership) {
      outcomes.set(edge.id, "membership");
    } else {
      const key = pairKey(edge.sourceTaskId, child);
      outcomes.set(edge.id, relatedPairs.has(key) ? "dropped" : "related");
    }
  }

  return { features, memberships, outcomes };
}
