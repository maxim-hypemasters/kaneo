// Project pages used to follow `task` permissions, and project details
// `project:update`. Grants a stored permission set the matching new
// permissions so nobody's access changes on upgrade:
// - document: read from task:read, create and update from task:update,
//   delete from task:delete;
// - project:edit_details from project:update.
// Returns the new JSON, or null when the set is unreadable or needs nothing.
export function grantProjectDocumentPermissions(raw: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const permissions = value as Record<string, unknown>;
  const next = { ...permissions };
  let changed = false;

  const task = Array.isArray(permissions.task) ? permissions.task : [];
  if (!Object.hasOwn(permissions, "document")) {
    const document = [
      ...(task.includes("update") ? ["create"] : []),
      ...(task.includes("read") ? ["read"] : []),
      ...(task.includes("update") ? ["update"] : []),
      ...(task.includes("delete") ? ["delete"] : []),
    ];
    if (document.length > 0) {
      next.document = document;
      changed = true;
    }
  }

  const project = permissions.project;
  if (
    Array.isArray(project) &&
    project.includes("update") &&
    !project.includes("edit_details")
  ) {
    next.project = [...project, "edit_details"];
    changed = true;
  }

  return changed ? JSON.stringify(next) : null;
}
