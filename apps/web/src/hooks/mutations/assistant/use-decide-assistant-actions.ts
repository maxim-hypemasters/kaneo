import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { applyDecisionsResult } from "@/components/assistant/proposals/apply-decisions-result";
import { mayHaveWritten } from "@/components/assistant/proposals/proposal-state";
import decideAssistantActions, {
  type AssistantDecision,
} from "@/fetchers/assistant/decide-assistant-actions";
import type { AssistantChatDetail } from "@/fetchers/assistant/get-assistant-chat";
import { assistantKeys } from "@/hooks/queries/assistant/assistant-keys";
import { HttpError } from "@/lib/http-error";
import { invalidateAfterAssistantWrite } from "@/lib/invalidate-after-assistant-write";
import { toast } from "@/lib/toast";

export type DecideVariables = {
  chatId: string;
  decisions: AssistantDecision[];
};

type Options = {
  /** Nothing waits any more: the answer can go on. */
  onResumable?: (chatId: string) => void;
};

const ERROR_KEYS: Record<string, string> = {
  ASSISTANT_CHAT_BUSY: "workspace:assistant.proposal.toast.busy",
  ASSISTANT_NOTHING_PENDING:
    "workspace:assistant.proposal.toast.alreadyDecided",
};

/**
 * The server refused the request before running anything: an assistant
 * error such as a busy chat. Anything else (a network error, a 5xx, a
 * gateway timeout) may have come after approved changes ran.
 */
function refusedBeforeRunning(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.code?.startsWith("ASSISTANT_") === true
  );
}

function errorKey(error: unknown): string {
  const code = error instanceof HttpError ? error.code : undefined;
  return code && Object.hasOwn(ERROR_KEYS, code)
    ? (ERROR_KEYS[code] as string)
    : "workspace:assistant.proposal.toast.failed";
}

/**
 * Approves or rejects proposed changes in one chat. Approved ones run on the
 * server before it answers; the decided rows then replace the cached ones.
 * When anything may have been written, every other cached query refreshes,
 * and when nothing waits any more `onResumable` lets the answer go on.
 */
export function useDecideAssistantActions(
  workspaceId: string,
  { onResumable }: Options = {},
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const onResumableRef = useRef(onResumable);
  onResumableRef.current = onResumable;
  const chatKey = (chatId: string) => assistantKeys.chat(workspaceId, chatId);

  return useMutation({
    mutationFn: ({ chatId, decisions }: DecideVariables) =>
      decideAssistantActions(workspaceId, chatId, { decisions }),
    // A fetch of the chat from before the decision would land after it and
    // bring the cards back as pending.
    onMutate: ({ chatId }) =>
      queryClient.cancelQueries({ queryKey: chatKey(chatId) }),
    onSuccess: async (result, { chatId }) => {
      await queryClient.cancelQueries({ queryKey: chatKey(chatId) });
      queryClient.setQueryData<AssistantChatDetail>(chatKey(chatId), (detail) =>
        applyDecisionsResult(detail, result),
      );
      void queryClient.invalidateQueries({
        queryKey: assistantKeys.chats(workspaceId),
      });
      if (result.messages.some(mayHaveWritten)) {
        invalidateAfterAssistantWrite(queryClient);
      }
      if (result.resumable) onResumableRef.current?.(chatId);
    },
    onError: (error, { chatId }) => {
      // Another tab may have decided, or the chat is answering: show what
      // the server has now.
      void queryClient.invalidateQueries({ queryKey: chatKey(chatId) });
      if (!refusedBeforeRunning(error)) {
        invalidateAfterAssistantWrite(queryClient);
      }
      toast.error(t(errorKey(error)));
    },
  });
}
