const NEW_RESOURCES = ["bug", "feature", "milestone"] as const;
const CRUD = ["create", "read", "update", "delete"];

// Bugs, features and milestones used to be governed by `task` permissions.
// Grants each missing new resource the CRUD actions the stored set has on
// `task`, so nobody's access changes on upgrade. Returns the new JSON, or null
// when the set is unreadable or already up to date.
export function mirrorTaskPermissions(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const permissions = value as Record<string, unknown>;
  const task = permissions.task;
  if (!Array.isArray(task)) return null;
  const granted = CRUD.filter((action) => task.includes(action));
  if (granted.length === 0) return null;

  const missing = NEW_RESOURCES.filter(
    (resource) => !Object.hasOwn(permissions, resource),
  );
  if (missing.length === 0) return null;

  const next = { ...permissions };
  for (const resource of missing) next[resource] = [...granted];
  return JSON.stringify(next);
}
