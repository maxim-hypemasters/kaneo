import type {
  ProjectScheduleTask,
  SchedulePreview,
} from "@/components/scheduling/project-schedule";
import type { ReleaseDates } from "./release";

export type ReleasePlanTask = ProjectScheduleTask & {
  completed: boolean;
  title: string;
  number: number | null;
  identifier: string | null;
  type: "task" | "bug";
  assigneeName: string | null;
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  estimateSeconds: number | null;
  priority: string;
  currentStart: string | null;
  currentEnd: string | null;
  featureId?: string | null;
  featureTitle?: string | null;
  milestoneId?: string | null;
  milestoneTitle?: string | null;
  milestoneReleaseId?: string | null;
  milestonePosition?: number | null;
  changed?: boolean;
};

export type ReleasePlanMoveTarget =
  | { releaseId: string }
  | { draftKey: string };

export type ReleasePlanChanges = {
  releaseDates?: { codeFreezeDate: string; submissionDate: string };
  moves?: {
    taskId: string;
    target: ReleasePlanMoveTarget;
  }[];
  milestoneMoves?: {
    milestoneId: string;
    target: ReleasePlanMoveTarget;
  }[];
  newRelease?: {
    key: string;
    name: string;
    startDate: string;
    codeFreezeDate: string;
    submissionDate: string;
  };
};

export type ReleasePlanTaskInputPatch = Partial<
  Pick<
    ReleasePlanTask,
    "currentAssigneeId" | "currentAssigneeName" | "estimateSeconds" | "priority"
  >
>;

export type ReleasePlan = {
  releaseId: string;
  generation: number;
  revision: string;
  inputRevision: string;
  appliedAt: string | null;
  planned: boolean;
  outdated: boolean;
  timeZone: string;
  tasks: ReleasePlanTask[];
};

export type ReleasePlanPreview = Omit<SchedulePreview, "tasks"> & {
  changes?: ReleasePlanChanges;
  releaseDates: ReleaseDates;
  timeZone: string;
  tasks: ReleasePlanTask[];
  dependencies: { blockerId: string; blockedId: string }[];
};

export type ReleasePlanApproval = Pick<
  ReleasePlanPreview,
  "asOf" | "revision" | "generation" | "timeZone"
> & { changes?: ReleasePlanChanges };
