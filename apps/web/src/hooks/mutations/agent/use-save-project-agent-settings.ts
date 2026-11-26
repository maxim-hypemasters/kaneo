import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import saveProjectAgentSettings, {
  type SaveProjectAgentSettingsInput,
} from "@/fetchers/agent/save-project-agent-settings";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { toast } from "@/lib/toast";

type Variables = { projectId: string; data: SaveProjectAgentSettingsInput };

export function useSaveProjectAgentSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: Variables) =>
      saveProjectAgentSettings(projectId, data),
    onSuccess: (settings, { projectId }) => {
      queryClient.setQueryData(agentKeys.projectSettings(projectId), settings);
      // Open task views learn of it over the socket too; this window may not
      // have one for the project.
      void queryClient.invalidateQueries({ queryKey: agentKeys.tasks });
      toast.success(t("settings:aiAgentPage.toast.saved"), {
        icon: SparklesIcon,
      });
    },
    onError: () => {
      toast.error(t("settings:aiAgentPage.toast.saveFailed"));
    },
  });
}
