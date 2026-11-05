import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type ScheduleSegment = { start: string; end: string };
export type ProjectScheduleTask = {
  taskId: string;
  assigneeId: string | null;
  start: string | null;
  end: string | null;
  segments: ScheduleSegment[];
  reason?: string | null;
};
export type ProjectSchedule = {
  generation: number;
  appliedAt: string | null;
  revision: string;
  outdated: boolean;
  legacy: boolean;
  settings: { timeZone: string | null; estimateDayMinutes: number };
  tasks: ProjectScheduleTask[];
};
export type SchedulePreview = {
  asOf: string;
  expiresAt?: string;
  planFrom: string;
  revision: string;
  inputRevision: string;
  generation: number;
  tasks: ProjectScheduleTask[];
  diagnostics: { taskId: string; reason: string }[];
  warnings: { taskId: string; reason: string }[];
  changedCount: number;
  scheduledCount: number;
  unscheduledCount: number;
};
export const projectScheduleKey = (projectId: string) =>
  ["project-schedule", projectId] as const;

async function result<T>(response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
export function getProjectSchedule(
  projectId: string,
): Promise<ProjectSchedule> {
  return client["project-schedule"][":projectId"]
    .$get({ param: { projectId } })
    .then(result<ProjectSchedule>);
}
