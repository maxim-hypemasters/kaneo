import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HttpError } from "@/lib/http-error";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { toast } from "@/lib/toast";
import {
  isTaskAssigneeAway,
  taskSaveErrorMessage,
  toastBulkSaveError,
  toastTaskSaveError,
} from "./task-away-error";

vi.mock("i18next", () => ({
  default: {
    resolvedLanguage: "en-US",
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

const away = (issues: { path: string; message: string }[]) =>
  new HttpError(409, "The assignee is away on 2027-01-06", {
    code: "TASK_ASSIGNEE_AWAY",
    issues,
  });

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
});

describe("isTaskAssigneeAway", () => {
  it("recognizes the code only", () => {
    expect(isTaskAssigneeAway(away([]))).toBe(true);
    expect(isTaskAssigneeAway(new HttpError(409, "Conflict"))).toBe(false);
    expect(isTaskAssigneeAway(new Error("TASK_ASSIGNEE_AWAY"))).toBe(false);
  });
});

describe("toastTaskSaveError", () => {
  it("names the days from the issue in the viewer's language", () => {
    toastTaskSaveError(
      away([
        {
          path: "tasks.t1",
          message:
            "Starts on 2027-01-06 and is due on 2027-01-08, when the assignee is away",
        },
      ]),
      "fallback",
    );
    const dates = new Intl.ListFormat("en-US", { type: "conjunction" }).format([
      formatReleaseDate("2027-01-06"),
      formatReleaseDate("2027-01-08"),
    ]);
    expect(toast.error).toHaveBeenCalledWith("tasks:assigneeAway.title", {
      description: `tasks:assigneeAway.onDays ${JSON.stringify({ dates })}`,
    });
  });

  it("keeps other errors' messages, and the fallback for anything else", () => {
    toastTaskSaveError(new HttpError(403, "Forbidden"), "fallback");
    toastTaskSaveError("oops", "fallback");
    expect(toast.error).toHaveBeenNthCalledWith(1, "Forbidden");
    expect(toast.error).toHaveBeenNthCalledWith(2, "fallback");
  });

  it("gives the same text for an inline message", () => {
    expect(taskSaveErrorMessage(away([]), "fallback")).toContain(
      "tasks:assigneeAway.onDays",
    );
    expect(taskSaveErrorMessage(new Error("Nope"), "fallback")).toBe("Nope");
    expect(taskSaveErrorMessage(null, "fallback")).toBe("fallback");
  });
});

describe("toastBulkSaveError", () => {
  const titles: Record<string, string> = {
    t1: "One",
    t2: "Two",
    t3: "Three",
    t4: "Four",
  };
  const titleOf = (id: string) => titles[id];
  const issue = (id: string) => ({
    path: `tasks.${id}`,
    message: "Due on 2027-01-06, when the assignee is away",
  });

  it("names the tasks in the way, at most three", () => {
    toastBulkSaveError(
      away(["t1", "t2", "t3", "t4"].map(issue)),
      "Couldn't assign",
      titleOf,
    );
    expect(toast.error).toHaveBeenCalledWith("Couldn't assign", {
      description: `tasks:assigneeAway.bulk ${JSON.stringify({
        count: 4,
        title: "One",
        titles: "One, Two, Three…",
      })}`,
    });
  });

  it("keeps the generic message for other errors", () => {
    toastBulkSaveError(new HttpError(500, "Boom"), "Couldn't assign", titleOf);
    expect(toast.error).toHaveBeenCalledWith("Couldn't assign");
  });
});
