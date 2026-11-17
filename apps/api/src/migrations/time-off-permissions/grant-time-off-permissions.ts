const WORK_ITEM_RESOURCES = ["task", "bug", "feature"] as const;

// Time off is a new resource, so stored roles have no `time_off` key and
// would get no access on upgrade. Grants each stored set the time-off actions
// its existing permissions imply:
// - create from update on task, bug or feature;
// - read from workspace:read;
// - approve from member:update, the existing "manages people" gate.
// Returns the new JSON, or null when the set is unreadable, already decides
// time off (even with an empty list), or implies nothing.
export function grantTimeOffPermissions(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const permissions = value as Record<string, unknown>;
  if (Object.hasOwn(permissions, "time_off")) return null;

  const allows = (resource: string, action: string) => {
    const actions = permissions[resource];
    return Array.isArray(actions) && actions.includes(action);
  };

  const timeOff = [
    ...(WORK_ITEM_RESOURCES.some((resource) => allows(resource, "update"))
      ? ["create"]
      : []),
    ...(allows("workspace", "read") ? ["read"] : []),
    ...(allows("member", "update") ? ["approve"] : []),
  ];
  if (timeOff.length === 0) return null;

  return JSON.stringify({ ...permissions, time_off: timeOff });
}
