import { Minimize2Icon, MessagesSquareIcon, SparklesIcon } from "lucide-react";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AssistantTurn } from "@/hooks/use-assistant-turn";
import { cn } from "@/lib/cn";
import { AssistantConversation } from "../conversation/assistant-conversation";
import {
  AssistantHistory,
  type AssistantHistoryHandle,
} from "../history/assistant-history";
import { AssistantKeyWarning } from "./assistant-key-warning";
import type { SelectChatOptions } from "./select-chat-options";

// Below lg one pane shows at a time; focus follows the pane that appears.
type FocusAfterToggle = "history" | "chats-button" | "composer";

type AssistantChatWindowProps = {
  /** What the minimized bar controls. */
  id: string;
  /** The heading that names the card's section. */
  headingId: string;
  workspaceId: string;
  workspaceSlug: string | undefined;
  chatId: string | null;
  model: string | null;
  warning: "key_rejected" | "out_of_credits" | null;
  canManage: boolean;
  turn: AssistantTurn;
  text: string;
  onTextChange: Dispatch<SetStateAction<string>>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onSelectChat: (chatId: string | null, options?: SelectChatOptions) => void;
  /** A chat was deleted; it may have been the open one. */
  onChatDeleted: (chatId: string) => void;
  onMinimize: () => void;
};

/**
 * The open assistant on Home: the conversation with its chat history beside
 * it (one at a time below lg).
 */
export function AssistantChatWindow({
  id,
  headingId,
  workspaceId,
  workspaceSlug,
  chatId,
  model,
  warning,
  canManage,
  turn,
  text,
  onTextChange,
  composerRef,
  onSelectChat,
  onChatDeleted,
  onMinimize,
}: AssistantChatWindowProps) {
  const { t } = useTranslation();
  const historyId = useId();
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<AssistantHistoryHandle>(null);
  const chatsButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef<FocusAfterToggle | null>(null);

  // Runs once the pane that was hidden is shown, so it can take focus.
  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === "history") historyRef.current?.focus();
    else if (target === "chats-button") chatsButtonRef.current?.focus();
    else if (target === "composer") composerRef.current?.focus();
  }, [showHistory, composerRef]);

  const toggleHistory = (show: boolean, focus: FocusAfterToggle) => {
    focusAfterToggle.current = focus;
    setShowHistory(show);
  };

  const selectChat = (id: string | null) => {
    if (showHistory) toggleHistory(false, "composer");
    if (id !== chatId) onSelectChat(id);
  };

  return (
    <div
      id={id}
      className="flex h-[min(40rem,72vh)] min-h-80 origin-top overflow-hidden rounded-xl border bg-card shadow-xs/5 transition-[opacity,scale,translate] duration-200 ease-out starting:-translate-y-1 starting:scale-99 starting:opacity-0 motion-reduce:transition-none"
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          showHistory && "max-lg:hidden",
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-border/60 border-b ps-4 pe-2.5">
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("workspace:assistant.minimize")}
            title={t("workspace:assistant.minimize")}
            onClick={onMinimize}
          >
            <Minimize2Icon aria-hidden="true" />
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
          text={text}
          onTextChange={onTextChange}
          onNewChat={() => selectChat(null)}
          onMinimize={onMinimize}
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
        onDeleted={onChatDeleted}
        className={cn(
          "w-full shrink-0 border-border/60 lg:flex lg:w-64 lg:border-l",
          !showHistory && "max-lg:hidden",
        )}
      />
    </div>
  );
}
