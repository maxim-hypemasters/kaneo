import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  reorderMilestones,
  setTaskMilestone,
  type MilestoneInput,
  type MilestoneCreateInput,
} from "@/fetchers/milestone/milestones";
import { HttpError } from "@/lib/http-error";
import { milestonesKey } from "@/hooks/queries/milestone/use-get-milestones";
export function useMilestoneMutations(projectId: string, featureId: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: milestonesKey(projectId),
    });
  };
  return {
    create: useMutation({
      mutationFn: (input: MilestoneCreateInput) =>
        createMilestone(featureId, input),
      onSuccess: (_data, variables) => {
        refresh();
        if (variables.taskIds?.length) {
          void client.invalidateQueries({ queryKey: ["tasks", projectId] });
          void client.invalidateQueries({
            queryKey: ["task-relations", featureId],
          });
          for (const id of variables.taskIds) {
            void client.invalidateQueries({ queryKey: ["task", id] });
            void client.invalidateQueries({ queryKey: ["activities", id] });
            void client.invalidateQueries({ queryKey: ["task-relations", id] });
          }
        }
      },
      onError: (error, variables) => {
        if (
          variables.taskIds?.length &&
          error instanceof HttpError &&
          error.status === 409
        ) {
          refresh();
        }
      },
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: MilestoneInput & { id: string }) =>
        updateMilestone(id, input),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: deleteMilestone,
      onSuccess: () => {
        refresh();
        const belongs = (data: unknown) => {
          const task = data as
            | { projectId?: string; featureId?: string; id?: string }
            | undefined;
          return (
            task?.projectId === projectId &&
            (task.id === featureId || task.featureId === featureId)
          );
        };
        void client.invalidateQueries({
          queryKey: ["task"],
          predicate: (query) => belongs(query.state.data),
        });
        void client.invalidateQueries({
          queryKey: ["activities"],
          predicate: (query) =>
            belongs(client.getQueryData(["task", query.queryKey[1]])),
        });
        void client.invalidateQueries({ queryKey: ["tasks", projectId] });
        void client.invalidateQueries({
          queryKey: ["task-relations", featureId],
        });
      },
    }),
    reorder: useMutation({
      mutationFn: (ids: string[]) => reorderMilestones(featureId, ids),
      onSuccess: refresh,
      onError: refresh,
    }),
  };
}
export function useSetTaskMilestone(projectId: string, featureId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      milestoneId,
    }: {
      id: string;
      milestoneId: string | null;
    }) => setTaskMilestone(id, milestoneId),
    onSuccess: (_data, { id }) => {
      void client.invalidateQueries({
        queryKey: milestonesKey(projectId),
      });
      void client.invalidateQueries({ queryKey: ["task", id] });
      void client.invalidateQueries({ queryKey: ["activities", id] });
      void client.invalidateQueries({ queryKey: ["tasks", projectId] });
      void client.invalidateQueries({
        queryKey: ["task-relations", featureId],
      });
    },
  });
}
