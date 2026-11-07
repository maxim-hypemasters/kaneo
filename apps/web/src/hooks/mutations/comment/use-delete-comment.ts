import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteComment from "@/fetchers/comment/delete-comment";

function useDeleteComment(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-activity"] });
      void queryClient.invalidateQueries({ queryKey: ["feature-workspace"] });
    },
  });
}

export default useDeleteComment;
