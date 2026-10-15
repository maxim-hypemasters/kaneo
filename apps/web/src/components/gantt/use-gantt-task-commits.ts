import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
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

const NO_PENDING_EDITS: ReadonlyMap<string, PendingTaskEdit> = new Map();

// Rejection for a queued edit whose predecessor failed. The edit was made on
// top of that predecessor's optimistic state, so it is dropped with it; the
// predecessor's own failure is the one the user is told about.
const PREDECESSOR_FAILED = Symbol("gantt-predecessor-failed");

// Saves Gantt drags. Each gesture becomes exactly one request: a lane-only
// drop uses the narrow assignee endpoint (it never rewrites dates or other
// fields), anything that moves dates is one full update carrying the new
// assignee too. Requests are serialised per task, and the edit is shown
// optimistically until the refetched task matches it.
export function useGanttTaskCommits(tasks: readonly ScheduledTask[]) {
  const { t } = useTranslation();
  const { mutateAsync: updateTask } = useUpdateTask();
  const { mutateAsync: updateTaskAssignee } = useUpdateTaskAssignee();
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

  const commit = useCallback(
    (task: ScheduledTask, edit: GanttTaskEdit, assignee: CommitAssignee) => {
      const kind = classifyEdit(task, edit);
      if (!kind.dates && !kind.assignee) return;

      nextSeqRef.current += 1;
      const seq = nextSeqRef.current;
      setPending((current) =>
        new Map(current).set(task.id, {
          ...edit,
          seq,
          assigneeName: assignee.name,
          assigneeImage: assignee.image,
        }),
      );

      const send = () => {
        sentRef.current.add(seq);
        return kind.dates
          ? updateTask({
              ...task,
              startDate: toIsoDay(edit.start),
              dueDate: toIsoDay(edit.end),
              userId: edit.userId,
            })
          : updateTaskAssignee({ ...task, userId: edit.userId });
      };

      // Send right away unless an earlier drag of this task is still in
      // flight; then wait for it, so the later edit is the one that sticks.
      const previous = queuesRef.current.get(task.id);
      const queued: Promise<unknown> = previous
        ? previous.then(send, () => Promise.reject(PREDECESSOR_FAILED))
        : send();
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
    },
    [t, updateTask, updateTaskAssignee],
  );

  return { pending, commit };
}
