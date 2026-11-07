import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateComment from "@/fetchers/comment/update-comment";

function useUpdateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateComment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-activity"] });
      void queryClient.invalidateQueries({ queryKey: ["feature-workspace"] });
    },
  });
}

export default useUpdateComment;
