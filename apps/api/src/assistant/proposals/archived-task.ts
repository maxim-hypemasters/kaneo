// Changing these on an archived task would move it out of the archive, and
// the assistant never unarchives work.
export const UNARCHIVING: ReadonlySet<string> = new Set([
  "update_task",
  "update_task_status",
]);

const ARCHIVED =
  "This task is archived, and the assistant can't unarchive work.";

/** A proposal refused because its task is archived. */
export const ARCHIVED_TASK = `${ARCHIVED} Nothing was proposed.`;

/** An approved change refused because its task was archived since. */
export const ARCHIVED_SINCE = `${ARCHIVED} Nothing was written.`;
