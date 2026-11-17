import { MessagesSquareIcon, SparklesIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAssistantTurn } from "@/hooks/use-assistant-turn";
import { cn } from "@/lib/cn";
import { AssistantConversation } from "../conversation/assistant-conversation";
import {
  AssistantHistory,
  type AssistantHistoryHandle,
} from "../history/assistant-history";
import { AssistantKeyWarning } from "./assistant-key-warning";

export type SelectChatOptions = { replace?: boolean };

// Below lg one pane shows at a time; focus follows the pane that appears.
type FocusAfterToggle = "history" | "chats-button" | "composer";

type AssistantChatCardProps = {
  workspaceId: string;
  workspaceSlug: string | undefined;
  chatId: string | null;
  model: string | null;
  warning: "key_rejected" | "out_of_credits" | null;
  canManage: boolean;
  onSelectChat: (chatId: string | null, options?: SelectChatOptions) => void;
};

/**
 * The conversation with its chat history beside it (one at a time below
 * lg). It owns the streaming turn, above everything keyed by chat id, so a
 * new chat getting its id and the URL following never interrupts it.
 */
export function AssistantChatCard({
  workspaceId,
  workspaceSlug,
  chatId,
  model,
  warning,
  canManage,
  onSelectChat,
}: AssistantChatCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const historyId = useId();
  const [showHistory, setShowHistory] = useState(false);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  const historyRef = useRef<AssistantHistoryHandle>(null);
  const chatsButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const focusAfterToggle = useRef<FocusAfterToggle | null>(null);

  // Runs once the pane that was hidden is shown, so it can take focus.
  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === "history") historyRef.current?.focus();
    else if (target === "chats-button") chatsButtonRef.current?.focus();
    else if (target === "composer") composerRef.current?.focus();
  }, [showHistory]);

  const toggleHistory = (show: boolean, focus: FocusAfterToggle) => {
    focusAfterToggle.current = focus;
    setShowHistory(show);
  };

  const turn = useAssistantTurn({
    workspaceId,
    // Follow the new chat only while it is still the one on screen.
    onChatCreated: (id) => {
      if (chatIdRef.current === null) onSelectChat(id, { replace: true });
    },
  });

  const selectChat = (id: string | null) => {
    if (showHistory) toggleHistory(false, "composer");
    if (id !== chatId) onSelectChat(id);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex h-[min(40rem,72vh)] min-h-80 overflow-hidden rounded-xl border bg-card shadow-xs/5"
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          showHistory && "max-lg:hidden",
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-border/60 border-b px-4">
          <SparklesIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          <h2
            id={headingId}
            className="flex-1 font-semibold text-foreground text-sm"
          >
            {t("workspace:assistant.title")}
          </h2>
          <Button
            ref={chatsButtonRef}
            variant="ghost"
            size="xs"
            className="lg:hidden"
            aria-expanded={showHistory}
            aria-controls={historyId}
            onClick={() => toggleHistory(true, "history")}
          >
            <MessagesSquareIcon aria-hidden="true" />
            {t("workspace:assistant.chats")}
          </Button>
        </div>
        {warning ? (
          <AssistantKeyWarning reason={warning} canManage={canManage} />
        ) : null}
        <AssistantConversation
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          chatId={chatId}
          model={model}
          turn={turn}
          onNewChat={() => selectChat(null)}
          composerRef={composerRef}
        />
      </div>
      <AssistantHistory
        ref={historyRef}
        id={historyId}
        workspaceId={workspaceId}
        selectedChatId={chatId}
        onSelect={selectChat}
        onNewChat={() => selectChat(null)}
        onBack={() => toggleHistory(false, "chats-button")}
        onDeleted={(id) => {
          if (id === chatIdRef.current) onSelectChat(null, { replace: true });
        }}
        className={cn(
          "w-full shrink-0 border-border/60 lg:flex lg:w-64 lg:border-l",
          !showHistory && "max-lg:hidden",
        )}
      />
    </section>
  );
}
