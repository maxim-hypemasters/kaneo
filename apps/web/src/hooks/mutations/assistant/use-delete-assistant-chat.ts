import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import deleteAssistantChat from "@/fetchers/assistant/delete-assistant-chat";
import { assistantKeys } from "@/hooks/queries/assistant/assistant-keys";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";

// Deletes one of the caller's chats. Refused (409) while it is answering.
export function useDeleteAssistantChat(workspaceId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chatId: string) => deleteAssistantChat(workspaceId, chatId),
    onSuccess: (_result, chatId) => {
      queryClient.removeQueries({
        queryKey: assistantKeys.chat(workspaceId, chatId),
      });
      void queryClient.invalidateQueries({
        queryKey: assistantKeys.chats(workspaceId),
      });
      toast.success(t("workspace:assistant.history.deleted"), {
        icon: Trash2Icon,
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof HttpError && error.code === "ASSISTANT_CHAT_BUSY"
          ? t("workspace:assistant.history.deleteBusy")
          : t("workspace:assistant.history.deleteFailed"),
      );
    },
  });
}
