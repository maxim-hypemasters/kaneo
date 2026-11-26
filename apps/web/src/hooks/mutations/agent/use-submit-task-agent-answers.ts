import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import submitTaskAgentAnswers, {
  type TaskAgentAnswer,
} from "@/fetchers/agent/submit-task-agent-answers";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { toast } from "@/lib/toast";

type Variables = { taskId: string; answers: TaskAgentAnswer[] };

export function useSubmitTaskAgentAnswers() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, answers }: Variables) =>
      submitTaskAgentAnswers(taskId, answers),
    onError: () => {
      toast.error(t("tasks:aiAgent.errors.answers"));
    },
    onSettled: (_data, _error, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.task(taskId) });
    },
  });
}
