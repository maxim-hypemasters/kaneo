import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import {
  updateMilestone,
  setTaskMilestone,
} from "@/fetchers/milestone/milestones";
import { toast } from "@/lib/toast";
import type { GanttTaskEdit, ScheduledTask } from "./gantt-types";
import {
  classifyEdit,
  type PendingTaskEdit,
  pendingEditLanded,
} from "./pending-task-edits";

type CommitAssignee = { name: string | null; image: string | null };
const NO_PENDING_EDITS: ReadonlyMap<string, PendingTaskEdit> = new Map();
const PREDECESSOR_FAILED = Symbol("gantt-predecessor-failed");

// Lane gestures edit planning inputs only. Published Task/Bug dates and
// planned assignee stay on the chart until another plan is reviewed/applied.
export function useGanttTaskCommits(tasks: readonly ScheduledTask[]) {
  const { t } = useTranslation();
  const { mutateAsync: updateTaskAssignee } = useUpdateTaskAssignee();
  const client = useQueryClient();
  const refreshMilestone = useCallback(
    (task: ScheduledTask) => {
      for (const queryKey of [
        ["feature-milestones", task.projectId],
        ["tasks", task.projectId],
        ["releases", task.projectId],
        ["project-schedule", task.projectId],
        ["task", task.featureId],
        ["activities", task.featureId],
      ])
        void client.invalidateQueries({ queryKey });
    },
    [client],
  );
  const [pending, setPending] = useState(NO_PENDING_EDITS);
  const nextSeqRef = useRef(0);
  const queuesRef = useRef(new Map<string, Promise<unknown>>());
  const settledRef = useRef(new Map<number, number>());
  const sentRef = useRef(new Set<number>());
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    setPending((current) => {
      let next: Map<string, PendingTaskEdit> | null = null;
      for (const [taskId, edit] of current) {
        const task = tasksById.get(taskId);
        const settledAt = settledRef.current.get(edit.seq);
        if (
          !task ||
          (sentRef.current.has(edit.seq) && pendingEditLanded(task, edit)) ||
          (settledAt !== undefined && settledAt < generation)
        ) {
          next ??= new Map(current);
          next.delete(taskId);
        }
      }
      return next ?? current;
    });
  }, [tasks]);

  const commit = useCallback(
    (
      task: ScheduledTask,
      edit: GanttTaskEdit,
      assignee: CommitAssignee,
    ): Promise<unknown> => {
      const kind = classifyEdit(task, edit);
      if (!kind.assignee && !kind.milestone) return Promise.resolve();
      const seq = ++nextSeqRef.current;
      setPending((current) =>
        new Map(current).set(task.id, {
          ...edit,
          start: task.scheduleStart,
          end: task.scheduleEnd,
          seq,
          assigneeName: assignee.name,
          assigneeImage: assignee.image,
          hasStartDate: Boolean(task.startDate),
          hasDueDate: Boolean(task.dueDate),
        }),
      );
      const send = async () => {
        sentRef.current.add(seq);
        if (task.entityKind === "milestone") {
          await updateMilestone(task.milestone.id, { leadId: edit.userId });
          refreshMilestone(task);
          return;
        }
        if (kind.assignee)
          await updateTaskAssignee({ ...task, userId: edit.userId });
        if (kind.milestone) {
          await setTaskMilestone(task.id, edit.milestoneId ?? null);
          refreshMilestone(task);
        }
      };
      const previous = queuesRef.current.get(task.id);
      const queued = previous
        ? previous.then(send, () => Promise.reject(PREDECESSOR_FAILED))
        : send();
      queuesRef.current.set(task.id, queued);
      queued
        .then(
          () => settledRef.current.set(seq, generationRef.current),
          (error: unknown) => {
            setPending((current) => {
              if (current.get(task.id)?.seq !== seq) return current;
              const next = new Map(current);
              next.delete(task.id);
              return next;
            });
            if (error !== PREDECESSOR_FAILED)
              toast.error(
                error instanceof Error
                  ? error.message
                  : kind.assignee
                    ? t("tasks:gantt.reassignError")
                    : t("tasks:gantt.milestones.moveError"),
              );
          },
        )
        .finally(() => {
          if (queuesRef.current.get(task.id) === queued)
            queuesRef.current.delete(task.id);
        });
      return queued;
    },
    [t, updateTaskAssignee, refreshMilestone],
  );
  return { pending, commit };
}
