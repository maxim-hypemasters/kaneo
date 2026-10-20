import { format } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import { useQueryClient } from "@tanstack/react-query";
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
import { toIsoDay } from "./timeline";

type CommitAssignee = {
  name: string | null;
  image: string | null;
};

type CommitOptions = {
  // Send only after this settles successfully; if it fails, this edit is
  // dropped silently (the failure it waited on is the one reported).
  after?: Promise<unknown>;
  // Shift only the date fields the task already has, instead of setting
  // both. For tasks moved along by a dependency, which the user didn't touch.
  keepDateFields?: boolean;
};

const NO_PENDING_EDITS: ReadonlyMap<string, PendingTaskEdit> = new Map();

// Rejection for a queued edit whose predecessor failed. The edit was made on
// top of that predecessor's optimistic state, so it is dropped with it; the
// predecessor's own failure is the one the user is told about.
const PREDECESSOR_FAILED = Symbol("gantt-predecessor-failed");

// Saves Gantt drags. A gesture becomes one request for its dates and
// assignee: a lane-only drop uses the narrow assignee endpoint (it never
// rewrites dates or other fields), anything that moves dates is one full
// update carrying the new assignee too. A drop on another milestone's lane
// then sends the milestone change, which the full update leaves alone; if
// only that fails, the dates and assignee stay saved, so edits built on
// them still go out. Requests are serialised per task, and the edit is
// shown optimistically until the refetched task matches it.
export function useGanttTaskCommits(tasks: readonly ScheduledTask[]) {
  const { t } = useTranslation();
  const { mutateAsync: updateTask } = useUpdateTask();
  const { mutateAsync: updateTaskAssignee } = useUpdateTaskAssignee();
  const client = useQueryClient();
  const refreshMilestone = useCallback(
    (task: ScheduledTask) => {
      void client.invalidateQueries({
        queryKey: ["feature-milestones", task.projectId],
      });
      void client.invalidateQueries({ queryKey: ["tasks", task.projectId] });
      void client.invalidateQueries({ queryKey: ["releases", task.projectId] });
      void client.invalidateQueries({ queryKey: ["task", task.featureId] });
      void client.invalidateQueries({
        queryKey: ["activities", task.featureId],
      });
    },
    [client],
  );
  const [pending, setPending] = useState(NO_PENDING_EDITS);
  const nextSeqRef = useRef(0);
  const queuesRef = useRef(new Map<string, Promise<unknown>>());
  // Successful edits by seq, with the task-data generation they settled in.
  // An edit the server stored differently would otherwise never "land" and
  // keep overriding the real data.
  const settledRef = useRef(new Map<number, number>());
  // Edits whose request has gone out. Until then server data can only
  // "match" an edit by coincidence (e.g. dragging a task away and straight
  // back while the first save is still queued), which must not clear it.
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
      if (!kind.dates && !kind.assignee && !kind.milestone) {
        return Promise.resolve();
      }

      nextSeqRef.current += 1;
      const seq = nextSeqRef.current;
      // A drag sets both dates; `task` already carries any pending edit's
      // fields, so this reads what the task will have, not what the server
      // last sent.
      const setsBoth = kind.dates && !options.keepDateFields;
      const hasStartDate = setsBoth || !!task.startDate;
      const hasDueDate = setsBoth || !!task.dueDate;
      setPending((current) =>
        new Map(current).set(task.id, {
          ...edit,
          seq,
          assigneeName: assignee.name,
          assigneeImage: assignee.image,
          hasStartDate,
          hasDueDate,
        }),
      );

      const sendFields = async () => {
        sentRef.current.add(seq);
        if (task.entityKind === "milestone") {
          await updateMilestone(task.milestone.id, {
            ...(kind.dates
              ? {
                  startDate: format(edit.start, "yyyy-MM-dd"),
                  endDate: format(edit.end, "yyyy-MM-dd"),
                }
              : {}),
            ...(kind.assignee ? { leadId: edit.userId } : {}),
          });
          refreshMilestone(task);
        } else if (kind.dates) {
          await updateTask({
            ...task,
            startDate: hasStartDate ? toIsoDay(edit.start) : null,
            dueDate: hasDueDate ? toIsoDay(edit.end) : null,
            userId: edit.userId,
          });
        } else if (kind.assignee) {
          await updateTaskAssignee({ ...task, userId: edit.userId });
        }
      };
      const sendMilestone = async () => {
        try {
          await setTaskMilestone(task.id, edit.milestoneId ?? null);
          refreshMilestone(task);
        } catch (error) {
          // The dates and assignee did save: keep showing them until the
          // refetch, back in the milestone the task is still in. A later edit
          // made on top of this one goes back there too.
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

      // Send right away unless an earlier drag of this task is still in
      // flight; then wait for it, so the later edit is the one that sticks.
      const previous = queuesRef.current.get(task.id);
      const prerequisites = [previous, options.after].filter(
        (promise): promise is Promise<unknown> => promise !== undefined,
      );
      // Waits for every prerequisite to settle, even after one fails, so
      // this task's queue never moves on while its earlier save is in flight.
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
          () => {
            settledRef.current.set(seq, generationRef.current);
          },
          (error: unknown) => {
            setPending((current) => {
              if (current.get(task.id)?.seq !== seq) return current;
              const next = new Map(current);
              next.delete(task.id);
              return next;
            });
            if (error === PREDECESSOR_FAILED) return;
            const fallback = kind.assignee
              ? t("tasks:gantt.reassignError")
              : t("tasks:gantt.updateDatesError");
            toast.error(error instanceof Error ? error.message : fallback);
          },
        )
        .finally(() => {
          if (queuesRef.current.get(task.id) === queued) {
            queuesRef.current.delete(task.id);
          }
        });
      return fieldsSaved;
    },
    [t, updateTask, updateTaskAssignee, refreshMilestone],
  );

  return { pending, commit };
}
