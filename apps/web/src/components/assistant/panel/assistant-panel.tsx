import { useAssistantStatus } from "@/hooks/queries/assistant/use-assistant-status";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { AssistantChatCard } from "./assistant-chat-card";
import { AssistantSetupCard } from "./assistant-setup-card";
import type { SelectChatOptions } from "./select-chat-options";

type AssistantPanelProps = {
  workspaceId: string;
  chatId: string | null;
  onSelectChat: (chatId: string | null, options?: SelectChatOptions) => void;
};

/**
 * The assistant on Home. Members see it once an admin has connected a key;
 * admins see a setup card until then. Nothing shows when the instance turned
 * the assistant off, or while its availability is unknown.
 */
export function AssistantPanel({
  workspaceId,
  chatId,
  onSelectChat,
}: AssistantPanelProps) {
  const { data: config } = useGetConfig();
  const { data: workspace } = useActiveWorkspace();
  const hasAssistant = config?.hasAssistant === true;
  const { data: status } = useAssistantStatus(workspaceId, {
    enabled: hasAssistant,
  });

  if (!hasAssistant || !status) return null;

  if (!status.enabled) {
    return status.canManage ? (
      <AssistantSetupCard
        workspaceId={workspaceId}
        unreadable={status.reason === "key_unreadable"}
      />
    ) : null;
  }

  return (
    <AssistantChatCard
      workspaceId={workspaceId}
      // Task permalinks in answers use the slug: /{slug}/task/{ticket}.
      workspaceSlug={workspace?.slug ?? undefined}
      chatId={chatId}
      model={status.model}
      warning={
        status.reason === "key_rejected" || status.reason === "out_of_credits"
          ? status.reason
          : null
      }
      canManage={status.canManage}
      onSelectChat={onSelectChat}
    />
  );
}
