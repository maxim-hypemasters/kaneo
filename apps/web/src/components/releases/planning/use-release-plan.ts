import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePreviewExpired } from "@/components/scheduling/use-preview-expired";
import {
  applyReleasePlan,
  getReleasePlan,
  previewReleasePlan,
} from "@/fetchers/release/release-plan";
import { invalidateReleaseLinks } from "@/lib/invalidate-release-links";
import type {
  ReleasePlan,
  ReleasePlanChanges,
  ReleasePlanPreview,
  ReleasePlanTask,
  ReleasePlanTaskInputPatch,
} from "@/types/release-plan";
import {
  hasCodeFreezeConflicts,
  normalizePlanChanges,
  planChangesKey,
  plannedMoveTaskIds,
} from "./release-plan-changes";

export const releasePlanKey = (
  projectId: string,
  releaseId: string,
  timeZone: string,
) => ["project-schedule", projectId, "release", releaseId, timeZone] as const;

export function useReleasePlan(
  projectId: string,
  releaseId: string,
  open: boolean,
) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [draft, setDraft] = useState<{
    projectId: string;
    releaseId: string;
    value: ReleasePlanPreview;
    rejected: boolean;
    changesKey: string;
  } | null>(null);
  const [changeState, setChangeState] = useState<{
    projectId: string;
    releaseId: string;
    value: ReleasePlanChanges;
    tasks: ReleasePlanTask[];
  } | null>(null);
  const changes =
    changeState?.projectId === projectId && changeState.releaseId === releaseId
      ? changeState.value
      : {};
  const changesRef = useRef(changes);
  changesRef.current = changes;
  const changesKey = planChangesKey(changes);
  const [appliedBaseline, setAppliedBaseline] = useState<{
    projectId: string;
    releaseId: string;
    inputRevision: string;
    generation: number;
    changes: ReleasePlanChanges;
    tasks: ReleasePlanTask[];
  } | null>(null);
  const savingIds = useRef(new Set<string>());
  const calculationVersion = useRef(0);
  const activeCalculation = useRef<number | null>(null);
  const applying = useRef(false);
  // Rejecting a duplicate mutation can detach its observer from the real
  // publication, so the write gate belongs to the request that acquired it.
  const [publishing, setPublishing] = useState(false);
  const [applyFailure, setApplyFailure] = useState<Error | null>(null);
  const activeContext = useRef({ projectId, releaseId, open });
  activeContext.current = { projectId, releaseId, open };
  const [inputSaving, setInputSavingState] = useState(false);
  useEffect(
    () => () => {
      calculationVersion.current += 1;
      activeCalculation.current = null;
    },
    [projectId, releaseId],
  );
  const query = useQuery({
    queryKey: releasePlanKey(projectId, releaseId, timeZone),
    queryFn: () => getReleasePlan(projectId, releaseId, timeZone),
    enabled: open,
    staleTime: 0,
  });
  const preview =
    draft?.projectId === projectId && draft.releaseId === releaseId
      ? draft.value
      : null;
  const applied =
    appliedBaseline?.projectId === projectId &&
    appliedBaseline.releaseId === releaseId;
  const latestInputs = new Map(
    query.data?.tasks.map((task) => [task.taskId, task]),
  );
  const unavailableTaskIds = new Set(
    preview && query.data
      ? preview.tasks
          .filter((task) => !latestInputs.has(task.taskId))
          .map((task) => task.taskId)
      : [],
  );
  // The editor follows current inputs; the chart keeps its reviewed snapshot.
  const tasks = query.data?.tasks ?? [];
  const movedIds = plannedMoveTaskIds(changes, tasks);
  const remainingTasks = tasks.filter((task) => !movedIds.has(task.taskId));
  const resolutionTasks = [
    ...new Map(
      [
        ...(applied ? appliedBaseline.tasks : []),
        ...(changeState?.projectId === projectId &&
        changeState.releaseId === releaseId
          ? changeState.tasks
          : []),
        ...tasks,
      ].map((task) => [task.taskId, task]),
    ).values(),
  ];
  const expired = usePreviewExpired(preview?.expiresAt);
  // Publication advances the generation without invalidating its own chart.
  const baseline = applied ? appliedBaseline : preview;
  const stale = Boolean(
    preview &&
    ((!applied && expired) ||
      (applied && query.data?.outdated) ||
      (!applied && draft?.changesKey !== changesKey) ||
      draft?.rejected ||
      (query.data &&
        baseline &&
        (query.data.inputRevision !== baseline.inputRevision ||
          query.data.generation !== baseline.generation))),
  );
  const currentCalculation = (
    job:
      | {
          version: number;
          projectId: string;
          releaseId: string;
          changesKey: string;
        }
      | undefined,
  ) =>
    Boolean(
      job &&
      job.version === calculationVersion.current &&
      job.projectId === activeContext.current.projectId &&
      job.releaseId === activeContext.current.releaseId &&
      job.changesKey === planChangesKey(changesRef.current) &&
      activeContext.current.open,
    );
  const calculate = useMutation({
    onMutate: (requestedChanges: ReleasePlanChanges) => {
      if (!open || savingIds.current.size || applying.current)
        throw new Error(t("tasks:scheduling.stalePreview"));
      const version = ++calculationVersion.current;
      activeCalculation.current = version;
      setApplyFailure(null);
      setAppliedBaseline(null);
      setDraft((current) => (current ? { ...current, rejected: true } : null));
      return {
        version,
        projectId,
        releaseId,
        changesKey: planChangesKey(requestedChanges),
      };
    },
    mutationFn: (requestedChanges: ReleasePlanChanges) => {
      if (savingIds.current.size)
        throw new Error(t("tasks:scheduling.stalePreview"));
      return previewReleasePlan(
        projectId,
        releaseId,
        timeZone,
        planChangesKey(requestedChanges) === "{}"
          ? undefined
          : requestedChanges,
      );
    },
    onSuccess: async (value, _, job) => {
      if (!currentCalculation(job)) return;
      // An initial read may have started before the preview snapshot. Cancel
      // it even without cached data so refetch cannot reuse that older request.
      await client.cancelQueries({
        queryKey: releasePlanKey(projectId, releaseId, timeZone),
        exact: true,
      });
      if (!currentCalculation(job)) return;
      setDraft({
        projectId,
        releaseId,
        value,
        rejected: false,
        changesKey: job!.changesKey,
      });
      void query.refetch();
    },
    onSettled: (_value, _error, _variables, job) => {
      if (job?.version === activeCalculation.current)
        activeCalculation.current = null;
    },
  });
  const apply = useMutation({
    onMutate: () => {
      if (
        !preview ||
        stale ||
        applied ||
        savingIds.current.size ||
        activeCalculation.current !== null ||
        applying.current ||
        query.isError ||
        hasCodeFreezeConflicts(preview) ||
        remainingTasks.some(
          (task) => !task.currentAssigneeId || (task.estimateSeconds ?? 0) <= 0,
        )
      )
        throw new Error(t("tasks:scheduling.stalePreview"));
      applying.current = true;
      setPublishing(true);
      setApplyFailure(null);
      return { ownsApply: true };
    },
    mutationFn: () => {
      if (
        !preview ||
        stale ||
        savingIds.current.size ||
        hasCodeFreezeConflicts(preview)
      )
        throw new Error(t("tasks:scheduling.stalePreview"));
      return applyReleasePlan(projectId, releaseId, {
        asOf: preview.asOf,
        revision: preview.revision,
        generation: preview.generation,
        timeZone: preview.timeZone,
        ...(changesKey !== "{}"
          ? { changes: normalizePlanChanges(changes) }
          : {}),
      });
    },
    onSuccess: (value) => {
      setAppliedBaseline({
        projectId,
        releaseId,
        inputRevision: value.inputRevision,
        generation: value.generation,
        changes: normalizePlanChanges(changes),
        tasks: resolutionTasks,
      });
      // Committed fixes remain an informational summary, never a new draft
      // that a later Refresh could replay against the changed memberships.
      changesRef.current = {};
      setChangeState(null);
      invalidateMyWork(client);
      client.setQueryData(
        releasePlanKey(projectId, releaseId, timeZone),
        value,
      );
      void client.invalidateQueries({
        queryKey: ["project-schedule", projectId],
      });
      invalidateReleaseLinks(
        client,
        projectId,
        [
          ...new Set([...value.tasks.map(({ taskId }) => taskId), ...movedIds]),
        ].map((id) => ({
          id,
          featureId:
            resolutionTasks.find((task) => task.taskId === id)?.featureId ??
            null,
        })),
      );
    },
    onError: (error, _variables, context) => {
      if (!context?.ownsApply) return;
      setApplyFailure(error);
      setDraft((current) => (current ? { ...current, rejected: true } : null));
      void query.refetch();
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.ownsApply) {
        applying.current = false;
        setPublishing(false);
      }
    },
  });
  const cancelCalculation = () => {
    calculationVersion.current += 1;
    activeCalculation.current = null;
    calculate.reset();
  };
  const reset = () => {
    if (applying.current || savingIds.current.size) return;
    cancelCalculation();
    setDraft(null);
    setAppliedBaseline(null);
    setApplyFailure(null);
    setChangeState(null);
    changesRef.current = {};
    apply.reset();
  };
  const setInputSaving = (taskId: string, saving: boolean) => {
    if (saving) {
      cancelCalculation();
      savingIds.current.add(taskId);
      setDraft((current) => (current ? { ...current, rejected: true } : null));
      setAppliedBaseline(null);
      setApplyFailure(null);
      apply.reset();
    } else {
      savingIds.current.delete(taskId);
    }
    setInputSavingState(savingIds.current.size > 0);
  };
  const inputsSaved = async (
    taskId: string,
    patch: ReleasePlanTaskInputPatch,
  ) => {
    await client.cancelQueries({
      queryKey: releasePlanKey(projectId, releaseId, timeZone),
      exact: true,
    });
    setDraft((current) => (current ? { ...current, rejected: true } : null));
    setAppliedBaseline(null);
    const updateTasks = (value: ReleasePlan): ReleasePlan => ({
      ...value,
      tasks: value.tasks.map((task) =>
        task.taskId === taskId ? { ...task, ...patch } : task,
      ),
    });
    client.setQueryData<ReleasePlan>(
      releasePlanKey(projectId, releaseId, timeZone),
      (value) => (value ? updateTasks(value) : value),
    );
    void query.refetch();
  };
  const updateChanges = (value: ReleasePlanChanges) => {
    if (applying.current || savingIds.current.size) return;
    const next = normalizePlanChanges(value);
    changesRef.current = next;
    setChangeState({
      projectId,
      releaseId,
      value: next,
      tasks: resolutionTasks,
    });
    calculate.mutate(next);
  };
  const discardChanges = () => {
    if (applying.current || savingIds.current.size) return;
    changesRef.current = {};
    setChangeState(null);
    setDraft(null);
    setAppliedBaseline(null);
    setApplyFailure(null);
  };
  return {
    query,
    preview,
    tasks,
    remainingTasks,
    resolutionTasks,
    changes: applied ? appliedBaseline.changes : changes,
    hasChanges: !applied && changesKey !== "{}",
    deadlineConflicts: hasCodeFreezeConflicts(preview),
    updateChanges,
    discardChanges,
    unavailableTaskIds,
    stale,
    calculate: {
      ...calculate,
      mutate: () => calculate.mutate(normalizePlanChanges(changesRef.current)),
      mutateAsync: () =>
        calculate.mutateAsync(normalizePlanChanges(changesRef.current)),
    },
    cancelCalculation,
    apply: {
      ...apply,
      isPending: publishing,
      error: applyFailure,
      reset: () => {
        apply.reset();
        setApplyFailure(null);
      },
    },
    applied,
    reset,
    inputSaving,
    setInputSaving,
    inputsSaved,
  };
}
