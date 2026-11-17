import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import removeAssistantSettings from "@/fetchers/assistant/remove-assistant-settings";
import { assistantKeys } from "@/hooks/queries/assistant/assistant-keys";
import { toast } from "@/lib/toast";

// Turns the assistant off for every member. Chats are kept.
export function useRemoveAssistantSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workspaceId: string) => removeAssistantSettings(workspaceId),
    onSuccess: (settings, workspaceId) => {
      queryClient.setQueryData(assistantKeys.settings(workspaceId), settings);
      queryClient.removeQueries({ queryKey: assistantKeys.usage(workspaceId) });
      void queryClient.invalidateQueries({
        queryKey: assistantKeys.status(workspaceId),
      });
      void queryClient.invalidateQueries({
        queryKey: assistantKeys.settings(workspaceId),
      });
      toast.success(t("settings:assistantPage.toast.removed"), {
        icon: Trash2Icon,
      });
    },
    onError: () => {
      toast.error(t("settings:assistantPage.toast.removeFailed"));
    },
  });
}
