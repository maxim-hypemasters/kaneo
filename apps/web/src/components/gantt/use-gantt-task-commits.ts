import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import moveTaskSchedule from "@/fetchers/task/move-task-schedule";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
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
type CommitOptions = {
  // Send only after this settles successfully; if it fails, this edit is
  // dropped silently (the failure it waited on is the one reported).
  after?: Promise<unknown>;
};
const NO_PENDING_EDITS: ReadonlyMap<string, PendingTaskEdit> = new Map();
const PREDECESSOR_FAILED = Symbol("gantt-predecessor-failed");

// Saves Gantt drags. Moving a Task/Bug sideways moves it on the schedule
// (planned work keeps its effort until the next Apply); a lane drop changes
// its assignee, which is a planning input, or its milestone. Requests are
// serialised per task, and the edit is shown optimistically until the
// refetched task matches it.
//
// `positionsUpdatedAt` is when the data that places the bars (the applied
// schedule, or the tasks before any Apply) was last loaded. A saved edit the
// server answered differently is only given up once that data is newer than
// the save: an unrelated refetch in between must not snap the bar back.
export function useGanttTaskCommits(
  tasks: readonly ScheduledTask[],
  positionsUpdatedAt?: number,
) {
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
  // Milestone ranges and the published schedule follow the moved dates.
  const refreshSchedule = useCallback(
    (task: ScheduledTask) => {
      invalidateMyWork(client);
      for (const queryKey of [
        ["project-schedule", task.projectId],
        ["tasks", task.projectId],
        ["feature-milestones", task.projectId],
        ["task", task.id],
        ["activities", task.id],
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
  const positionsRef = useRef(positionsUpdatedAt);

  useEffect(() => {
    // Without a load time to go by, any change of the tasks counts.
    if (
      positionsUpdatedAt === undefined ||
      positionsUpdatedAt !== positionsRef.current
    ) {
      positionsRef.current = positionsUpdatedAt;
      generationRef.current += 1;
    }
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
  }, [tasks, positionsUpdatedAt]);

  // Resolves once the edit's dates and assignee are saved: that is what moves
  // made on top of it wait for, not its milestone move.
  const commit = useCallback(
    (
      task: ScheduledTask,
      edit: GanttTaskEdit,
      assignee: CommitAssignee,
      options: CommitOptions = {},
    ): Promise<unknown> => {
      const kind = classifyEdit(task, edit);
      if (!kind.dates && !kind.assignee && !kind.milestone)
        return Promise.resolve();
      const seq = ++nextSeqRef.current;
      setPending((current) =>
        new Map(current).set(task.id, {
          ...edit,
          start: kind.dates ? edit.start : task.scheduleStart,
          end: kind.dates ? edit.end : task.scheduleEnd,
          seq,
          assigneeName: assignee.name,
          assigneeImage: assignee.image,
          hasStartDate: Boolean(task.startDate) || Boolean(edit.exact),
          hasDueDate: Boolean(task.dueDate) || Boolean(edit.exact),
        }),
      );

      const sendFields = async () => {
        sentRef.current.add(seq);
        if (task.entityKind === "milestone") {
          await updateMilestone(task.milestone.id, { leadId: edit.userId });
          refreshMilestone(task);
          return;
        }
        if (kind.dates) {
          await (edit.exact
            ? moveTaskSchedule(task.id, edit.start, edit.end, true)
            : moveTaskSchedule(task.id, edit.start, edit.end));
          refreshSchedule(task);
        }
        if (kind.assignee)
          await updateTaskAssignee({ ...task, userId: edit.userId });
      };
      const sendMilestone = async () => {
        try {
          await setTaskMilestone(task.id, edit.milestoneId ?? null);
          refreshMilestone(task);
        } catch (error) {
          // The dates and assignee did save: keep showing them until the
          // refetch, back in the milestone the task is still in.
          setPending((current) => {
            const shown = current.get(task.id);
            if (!shown || shown.milestoneId !== edit.milestoneId)
              return current;
            return new Map(current).set(task.id, {
              ...shown,
              milestoneId: task.milestoneId ?? null,
            });
          });
          toast.error(
            error instanceof Error
              ? error.message
              : t("tasks:gantt.milestones.moveError"),
          );
        }
      };

      // Send right away unless an earlier drag of this task (or the move this
      // one makes room for) is still in flight; then wait for it, so the
      // later edit is the one that sticks.
      const prerequisites = [
        queuesRef.current.get(task.id),
        options.after,
      ].filter((promise): promise is Promise<unknown> => promise !== undefined);
      const fieldsSaved: Promise<unknown> =
        prerequisites.length > 0
          ? Promise.allSettled(prerequisites).then((results) =>
              results.every((result) => result.status === "fulfilled")
                ? sendFields()
                : Promise.reject(PREDECESSOR_FAILED),
            )
          : sendFields();
      // The milestone move goes last, once the dates and assignee have saved;
      // with nothing to wait for (a lane-only move) it goes out at once. Its
      // failure doesn't fail the edit, whose dates and assignee stay saved.
      const membershipWaits =
        kind.dates || kind.assignee || prerequisites.length > 0;
      const queued = !kind.milestone
        ? fieldsSaved
        : membershipWaits
          ? fieldsSaved.then(sendMilestone)
          : sendMilestone();
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
                  : kind.dates
                    ? t("tasks:gantt.updateDatesError")
                    : t("tasks:gantt.reassignError"),
              );
          },
        )
        .finally(() => {
          if (queuesRef.current.get(task.id) === queued)
            queuesRef.current.delete(task.id);
        });
      return fieldsSaved;
    },
    [t, updateTaskAssignee, refreshMilestone, refreshSchedule],
  );
  return { pending, commit };
}
