import { describe, expect, it } from "vite-plus/test";
import type { CheckedDay } from "./checked-days";
import { taskAssigneeAwayError } from "./task-assignee-away-error";

const day = (
  taskId: string,
  field: CheckedDay["field"],
  date: string,
): CheckedDay => ({ taskId, assigneeId: "ann", field, day: date });

const texts = (error: ReturnType<typeof taskAssigneeAwayError>) =>
  [error.message, ...(error.issues ?? []).map((issue) => issue.message)].join(
    " ",
  );

describe("taskAssigneeAwayError", () => {
  it("names the date of a single task", () => {
    const error = taskAssigneeAwayError([day("t1", "dueDate", "2027-01-06")]);
    expect(error.status).toBe(409);
    expect(error.code).toBe("TASK_ASSIGNEE_AWAY");
    expect(error.message).toBe(
      "The assignee is away on 2027-01-06; choose another due date or assignee",
    );
    expect(error.issues).toEqual([
      {
        path: "tasks.t1",
        message: "Due on 2027-01-06, when the assignee is away",
      },
    ]);
  });

  it("gives a task whose start and due dates conflict one issue", () => {
    const error = taskAssigneeAwayError([
      day("t1", "startDate", "2027-01-05"),
      day("t1", "dueDate", "2027-01-06"),
    ]);
    expect(error.message).toBe(
      "The assignee is away on 2027-01-05 and 2027-01-06; choose other dates or another assignee",
    );
    expect(error.issues).toEqual([
      {
        path: "tasks.t1",
        message:
          "Starts on 2027-01-05 and is due on 2027-01-06, when the assignee is away",
      },
    ]);
    expect(
      taskAssigneeAwayError([
        day("t1", "startDate", "2027-01-06"),
        day("t1", "dueDate", "2027-01-06"),
      ]).issues?.[0]?.message,
    ).toBe("Starts and is due on 2027-01-06, when the assignee is away");
  });

  it("counts the tasks and lists an issue for each", () => {
    const error = taskAssigneeAwayError([
      day("t1", "dueDate", "2027-01-06"),
      day("t2", "startDate", "2027-01-07"),
    ]);
    expect(error.message).toBe(
      "2 tasks would start or be due on a day their assignee is away",
    );
    expect(error.issues).toEqual([
      {
        path: "tasks.t1",
        message: "Due on 2027-01-06, when the assignee is away",
      },
      {
        path: "tasks.t2",
        message: "Starts on 2027-01-07, when the assignee is away",
      },
    ]);
  });

  it("never says why the assignee is away", () => {
    const text = texts(
      taskAssigneeAwayError([
        day("t1", "dueDate", "2027-01-01"),
        day("t2", "dueDate", "2027-01-01"),
      ]),
    ).toLowerCase();
    for (const word of ["vacation", "sick", "holiday", "time off", "note"])
      expect(text).not.toContain(word);
  });
});
