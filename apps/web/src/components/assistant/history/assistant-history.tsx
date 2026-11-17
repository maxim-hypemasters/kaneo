import { ArrowLeftIcon, MessagesSquareIcon, SquarePenIcon } from "lucide-react";
import {
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AssistantChatSummary } from "@/fetchers/assistant/get-assistant-chats";
import { useDeleteAssistantChat } from "@/hooks/mutations/assistant/use-delete-assistant-chat";
import { useAssistantChats } from "@/hooks/queries/assistant/use-assistant-chats";
import { cn } from "@/lib/cn";
import { DeleteChatDialog } from "./delete-chat-dialog";
import { HistoryItem } from "./history-item";

export type AssistantHistoryHandle = {
  /** Focuses the selected chat's row, or the heading when it isn't listed. */
  focus: () => void;
};

type AssistantHistoryProps = {
  id?: string;
  workspaceId: string;
  selectedChatId: string | null;
  onSelect: (chatId: string) => void;
  onNewChat: () => void;
  /** Below lg, returns to the conversation. */
  onBack: () => void;
  onDeleted: (chatId: string) => void;
  className?: string;
  ref?: Ref<AssistantHistoryHandle>;
};

export function AssistantHistory({
  id,
  workspaceId,
  selectedChatId,
  onSelect,
  onNewChat,
  onBack,
  onDeleted,
  className,
  ref,
}: AssistantHistoryProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => (selectedRowRef.current ?? headingRef.current)?.focus(),
    }),
    [],
  );
  const chatsQuery = useAssistantChats(workspaceId);
  const deleteChat = useDeleteAssistantChat(workspaceId);
  const [deleteTarget, setDeleteTarget] = useState<AssistantChatSummary | null>(
    null,
  );
  const chats = chatsQuery.data?.pages.flatMap((page) => page.chats) ?? [];

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const chatId = deleteTarget.id;
    deleteChat.mutate(chatId, { onSuccess: () => onDeleted(chatId) });
  };

  let list: ReactNode;
  if (chatsQuery.isPending) {
    list = (
      <p role="status" className="px-4 py-3 text-muted-foreground text-sm">
        {t("workspace:assistant.history.loading")}
      </p>
    );
  } else if (chatsQuery.isError && chats.length === 0) {
    list = (
      <div className="flex flex-col items-start gap-2 px-4 py-3">
        <p role="alert" className="text-muted-foreground text-sm">
          {t("workspace:assistant.history.loadError")}
        </p>
        <Button
          variant="outline"
          size="xs"
          onClick={() => void chatsQuery.refetch()}
        >
          {t("workspace:assistant.history.tryAgain")}
        </Button>
      </div>
    );
  } else if (chats.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
        <MessagesSquareIcon
          aria-hidden="true"
          className="size-5 text-muted-foreground/50"
        />
        <p className="text-muted-foreground text-sm">
          {t("workspace:assistant.history.empty")}
        </p>
      </div>
    );
  } else {
    list = (
      <>
        <ul className="flex flex-col gap-0.5 px-2">
          {chats.map((chat) => (
            <HistoryItem
              key={chat.id}
              ref={chat.id === selectedChatId ? selectedRowRef : undefined}
              chat={chat}
              isSelected={chat.id === selectedChatId}
              onSelect={onSelect}
              onDelete={setDeleteTarget}
            />
          ))}
        </ul>
        {chatsQuery.hasNextPage ? (
          <div className="px-2 pt-1">
            <Button
              variant="ghost"
              size="xs"
              className="w-full text-muted-foreground"
              disabled={chatsQuery.isFetchingNextPage}
              onClick={() => void chatsQuery.fetchNextPage()}
            >
              {chatsQuery.isFetchingNextPage
                ? t("workspace:assistant.history.loadingOlder")
                : t("workspace:assistant.history.showOlder")}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <nav
      id={id}
      aria-label={t("workspace:assistant.history.label")}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-border/60 border-b px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          className="lg:hidden"
          aria-label={t("workspace:assistant.backToChat")}
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="flex-1 ps-2 font-medium text-[13px] text-muted-foreground outline-none max-lg:ps-0"
        >
          {t("workspace:assistant.chats")}
        </h3>
        <Button variant="ghost" size="xs" onClick={onNewChat}>
          <SquarePenIcon aria-hidden="true" />
          {t("workspace:assistant.newChat")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">{list}</div>
      <DeleteChatDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
      />
    </nav>
  );
}
