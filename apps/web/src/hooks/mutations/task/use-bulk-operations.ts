import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import bulkOperation from "@/fetchers/task/bulk-operation";
import deleteTask from "@/fetchers/task/delete-task";

export function useBulkOperations() {
  const queryClientRef = useQueryClient();

  const invalidateCommon = () => {
    queryClientRef.invalidateQueries({ queryKey: ["tasks"] });
    queryClientRef.invalidateQueries({ queryKey: ["projects"] });
    invalidateMyWork(queryClientRef);
  };
  const invalidateProgress = () => {
    invalidateCommon();
    // Bulk selections may span projects, and the response carries no project ids.
    void queryClientRef.invalidateQueries({ queryKey: ["release-progress"] });
    void queryClientRef.invalidateQueries({ queryKey: ["feature-milestones"] });
  };

  const bulkDelete = useMutation({
    mutationFn: async (taskIds: string[]) => {
      const results = await Promise.allSettled(
        taskIds.map((id) => deleteTask(id)),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
    // Earlier deletions may have committed before another deletion failed.
    onSettled: invalidateProgress,
  });

  const bulkArchive = useMutation({
    mutationFn: async (taskIds: string[]) => {
      await bulkOperation({
        taskIds,
        operation: "updateStatus",
        value: "archived",
      });
    },
    onSuccess: invalidateProgress,
  });

  const bulkChangeStatus = useMutation({
    mutationFn: async ({
      taskIds,
      status,
    }: {
      taskIds: string[];
      status: string;
    }) => {
      await bulkOperation({
        taskIds,
        operation: "updateStatus",
        value: status,
      });
    },
    onSuccess: invalidateProgress,
  });

  const bulkAssign = useMutation({
    mutationFn: async ({
      taskIds,
      userId,
    }: {
      taskIds: string[];
      userId: string;
    }) => {
      await bulkOperation({
        taskIds,
        operation: "updateAssignee",
        value: userId,
      });
    },
    onSuccess: invalidateCommon,
  });

  const bulkMoveToBacklog = useMutation({
    mutationFn: async (taskIds: string[]) => {
      await bulkOperation({
        taskIds,
        operation: "updateStatus",
        value: "planned",
      });
    },
    onSuccess: invalidateProgress,
  });

  const bulkMoveToBoard = useMutation({
    mutationFn: async ({
      taskIds,
      status,
    }: {
      taskIds: string[];
      status: string;
    }) => {
      await bulkOperation({
        taskIds,
        operation: "updateStatus",
        value: status,
      });
    },
    onSuccess: invalidateProgress,
  });

  const bulkPriority = useMutation({
    mutationFn: async ({
      taskIds,
      priority,
    }: {
      taskIds: string[];
      priority: string;
    }) => {
      await bulkOperation({
        taskIds,
        operation: "updatePriority",
        value: priority,
      });
    },
    onSuccess: invalidateCommon,
  });

  const bulkAddLabel = useMutation({
    mutationFn: async ({
      taskIds,
      labelId,
    }: {
      taskIds: string[];
      labelId: string;
    }) => {
      await bulkOperation({
        taskIds,
        operation: "addLabel",
        value: labelId,
      });
    },
    onSuccess: () => {
      invalidateCommon();
      queryClientRef.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  const bulkDueDate = useMutation({
    mutationFn: async ({
      taskIds,
      dueDate,
    }: {
      taskIds: string[];
      dueDate: string | null;
    }) => {
      await bulkOperation({
        taskIds,
        operation: "updateDueDate",
        value: dueDate,
      });
    },
    onSuccess: invalidateCommon,
  });

  return {
    bulkDelete: bulkDelete.mutateAsync,
    isDeleting: bulkDelete.isPending,
    bulkArchive: bulkArchive.mutateAsync,
    bulkChangeStatus: bulkChangeStatus.mutateAsync,
    bulkAssign: bulkAssign.mutateAsync,
    bulkMoveToBacklog: bulkMoveToBacklog.mutateAsync,
    bulkMoveToBoard: bulkMoveToBoard.mutateAsync,
    bulkPriority: bulkPriority.mutateAsync,
    bulkAddLabel: bulkAddLabel.mutateAsync,
    bulkDueDate: bulkDueDate.mutateAsync,
  };
}
