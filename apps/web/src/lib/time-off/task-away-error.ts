import i18n from "i18next";
import { HttpError } from "@/lib/http-error";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { toast } from "@/lib/toast";

export const TASK_ASSIGNEE_AWAY = "TASK_ASSIGNEE_AWAY";

// How many tasks a bulk error names before "…".
const MAX_TITLES = 3;

// The server refused a task date or assignee because the assignee is away
// on the task's start or due day.
export function isTaskAssigneeAway(error: unknown): error is HttpError {
  return error instanceof HttpError && error.code === TASK_ASSIGNEE_AWAY;
}

function locale() {
  return i18n.resolvedLanguage || i18n.language || undefined;
}

function listOf(items: readonly string[]) {
  try {
    return new Intl.ListFormat(locale(), { type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

// The days the server's issue names (YYYY-MM-DD; never a type, note or
// holiday name), in the viewer's language.
function awayDescription(error: HttpError) {
  const text = error.issues?.[0]?.message ?? error.message;
  const days = [...new Set(text.match(/\d{4}-\d{2}-\d{2}/g) ?? [])];
  return days.length > 0
    ? i18n.t("tasks:assigneeAway.onDays", {
        dates: listOf(days.map((day) => formatReleaseDate(day))),
      })
    : text;
}

// What a failed save of one task says: why the assignee rule refused it, or
// the server's own message.
export function taskSaveErrorMessage(error: unknown, fallback: string) {
  if (isTaskAssigneeAway(error)) return awayDescription(error);
  return error instanceof Error ? error.message : fallback;
}

export function toastTaskSaveError(error: unknown, fallback: string) {
  if (isTaskAssigneeAway(error)) {
    toast.error(i18n.t("tasks:assigneeAway.title"), {
      description: awayDescription(error),
    });
    return;
  }
  toast.error(error instanceof Error ? error.message : fallback);
}

// A bulk change saves all or nothing; when the assignee rule refused it,
// says which tasks stood in the way.
export function toastBulkSaveError(
  error: unknown,
  fallback: string,
  titleOf: (taskId: string) => string | undefined,
) {
  if (!isTaskAssigneeAway(error)) {
    toast.error(fallback);
    return;
  }
  const titles = (error.issues ?? []).flatMap(({ path }) => {
    const title = titleOf(path.replace(/^tasks\./, ""));
    return title ? [title] : [];
  });
  const shown = titles.slice(0, MAX_TITLES).join(", ");
  // Titles come from the loaded project; without any, the server's message.
  const description =
    titles.length === 0
      ? error.message
      : i18n.t("tasks:assigneeAway.bulk", {
          count: error.issues?.length ?? titles.length,
          title: titles[0],
          titles: titles.length > MAX_TITLES ? `${shown}…` : shown,
        });
  toast.error(fallback, { description });
}
