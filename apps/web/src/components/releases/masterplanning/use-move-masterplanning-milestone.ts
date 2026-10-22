import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  updateMilestone,
  type MilestoneWithFeature,
} from "@/fetchers/milestone/milestones";
import { milestonesKey } from "@/hooks/queries/milestone/use-get-milestones";
import { invalidateReleaseLinks } from "@/lib/invalidate-release-links";

type MoveFailure = { releaseId: string | null; error: unknown };
const NO_MILESTONES: MilestoneWithFeature[] = [];

export function useMoveMasterplanningMilestone(
  projectId: string,
  milestones: readonly MilestoneWithFeature[] = NO_MILESTONES,
) {
  const client = useQueryClient();
  const latest = useRef(milestones);
  latest.current = milestones;
  const pendingRef = useRef(new Map<string, string | null>());
  const [pending, setPending] = useState(pendingRef.current);
  const [failures, setFailures] = useState(new Map<string, MoveFailure>());

  const dismissError = useCallback((id: string) => {
    setFailures((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const move = useCallback(
    async (id: string, releaseId: string | null) => {
      const milestone = latest.current.find((item) => item.id === id);
      if (!milestone || pendingRef.current.has(id)) return false;
      if (milestone.releaseId === releaseId) {
        dismissError(id);
        return true;
      }
      pendingRef.current = new Map(pendingRef.current).set(id, releaseId);
      setPending(pendingRef.current);
      dismissError(id);
      try {
        await updateMilestone(id, { releaseId });
        // A PATCH response can contain older child-derived fields than a
        // concurrent refresh. Patch membership alone, and never revive deletion.
        client.setQueriesData<MilestoneWithFeature[]>(
          { queryKey: milestonesKey(projectId) },
          (current) =>
            Array.isArray(current)
              ? current.map((item) =>
                  item.id === id ? { ...item, releaseId } : item,
                )
              : current,
        );
        return true;
      } catch (error) {
        setFailures((current) =>
          new Map(current).set(id, { releaseId, error }),
        );
        return false;
      } finally {
        pendingRef.current = new Map(pendingRef.current);
        pendingRef.current.delete(id);
        setPending(pendingRef.current);
        invalidateReleaseLinks(client, projectId, [milestone]);
      }
    },
    [client, dismissError, projectId],
  );

  const retry = useCallback(
    (id: string) => {
      const failure = failures.get(id);
      return failure ? move(id, failure.releaseId) : Promise.resolve(false);
    },
    [failures, move],
  );

  return {
    milestones: milestones.map((milestone) =>
      pending.has(milestone.id)
        ? { ...milestone, releaseId: pending.get(milestone.id) ?? null }
        : milestone,
    ),
    pendingIds: new Set(pending.keys()) as ReadonlySet<string>,
    failures: failures as ReadonlyMap<string, MoveFailure>,
    move,
    retry,
    dismissError,
  };
}
