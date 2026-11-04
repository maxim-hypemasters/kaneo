export type PlanningTaskState =
  | "todo"
  | "active"
  | "done"
  | "backlog"
  | "archived";

export type PlanningTask = {
  id: string;
  assigneeId: string | null;
  priority: string | null;
  position: number;
  state: PlanningTaskState;
  estimateSeconds: number | null;
  loggedSeconds: number;
  releaseId: string | null;
};

export type PlanningCalendar = {
  assigneeId: string;
  timeZone: string;
  weeklyIntervals: {
    weekday: number;
    startMinute: number;
    endMinute: number;
  }[];
  timeOff: { start: string; end: string }[];
};

export type PlanningRelease = {
  id: string;
  startDate: string;
  codeFreezeDate: string;
  submissionDate: string;
};

export type ScheduleInput = {
  asOf: string;
  planFrom: string;
  timeZone: string;
  tasks: PlanningTask[];
  calendars: PlanningCalendar[];
  releases: PlanningRelease[];
  dependencies: { blockerId: string; blockedId: string }[];
  reservations?: { assigneeId: string; start: string; end: string }[];
  externalBlockers?: {
    id: string;
    state: "done" | "archived" | "unfinished";
    appliedEnd: string | null;
    available: boolean;
  }[];
};

export type ScheduleReason =
  | "backlog"
  | "archived"
  | "unassigned"
  | "no_estimate"
  | "estimate_exhausted"
  | "no_calendar"
  | "dependency_cycle"
  | "blocked_dependency"
  | "external_dependency_unavailable"
  | "outside_planning_horizon";

export type ScheduleWarning = {
  taskId: string;
  code: "after_code_freeze" | "after_submission";
  releaseId: string;
};

export type ScheduledTask = {
  id: string;
  assigneeId: string | null;
  segments: { start: string; end: string }[];
  start: string | null;
  end: string | null;
  reason: ScheduleReason | null;
  warnings: ScheduleWarning[];
};

export type ScheduleResult = {
  asOf: string;
  planFrom: string;
  tasks: ScheduledTask[];
  warnings: ScheduleWarning[];
};
