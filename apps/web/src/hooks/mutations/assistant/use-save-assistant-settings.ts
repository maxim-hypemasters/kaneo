import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import saveAssistantSettings, {
  type SaveAssistantSettingsInput,
} from "@/fetchers/assistant/save-assistant-settings";
import { assistantKeys } from "@/hooks/queries/assistant/assistant-keys";
import { toast } from "@/lib/toast";

type Variables = { workspaceId: string; data: SaveAssistantSettingsInput };

// Errors are not toasted: the form shows them next to the field they concern.
export function useSaveAssistantSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, data }: Variables) =>
      saveAssistantSettings(workspaceId, data),
    onSuccess: ({ modelUnverified, ...settings }, { workspaceId }) => {
      queryClient.setQueryData(assistantKeys.settings(workspaceId), settings);
      for (const queryKey of [
        assistantKeys.status(workspaceId),
        assistantKeys.settings(workspaceId),
        assistantKeys.usage(workspaceId),
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }

      if (modelUnverified) {
        toast.warning(t("settings:assistantPage.toast.savedUnverified"), {
          icon: TriangleAlertIcon,
        });
      } else {
        toast.success(t("settings:assistantPage.toast.saved"), {
          icon: SparklesIcon,
        });
      }
    },
  });
}
