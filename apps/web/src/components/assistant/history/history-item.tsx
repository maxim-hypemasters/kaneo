import { MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import type { AssistantChatSummary } from "@/fetchers/assistant/get-assistant-chats";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

type HistoryItemProps = {
  chat: AssistantChatSummary;
  isSelected: boolean;
  onSelect: (chatId: string) => void;
  onDelete: (chat: AssistantChatSummary) => void;
  /** The row's main button, which opens the chat. */
  ref?: Ref<HTMLButtonElement>;
};

export function HistoryItem({
  chat,
  isSelected,
  onSelect,
  onDelete,
  ref,
}: HistoryItemProps) {
  const { t } = useTranslation();
  const title = chat.title.trim() || t("workspace:assistant.history.untitled");
  const needsApproval = chat.pendingCount > 0;

  return (
    <li className="group relative">
      <button
        ref={ref}
        type="button"
        aria-current={isSelected ? "true" : undefined}
        onClick={() => onSelect(chat.id)}
        className={cn(
          "flex w-full cursor-pointer flex-col gap-0.5 rounded-lg py-2 ps-3 pe-9 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          isSelected ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
            {title}
          </span>
          {/* Always takes its slot so titles line up across rows. */}
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              needsApproval && "bg-info",
            )}
          >
            {needsApproval ? (
              <span className="sr-only">
                {t("workspace:assistant.history.needsApproval")}
              </span>
            ) : null}
          </span>
        </span>
        <time
          dateTime={chat.updatedAt}
          title={formatDateTime(chat.updatedAt)}
          className="text-muted-foreground text-xs"
        >
          {formatRelativeTime(chat.updatedAt)}
        </time>
      </button>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={t("workspace:assistant.history.actions", { title })}
              className="absolute top-2 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100 lg:opacity-0"
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-36">
          <MenuItem variant="destructive" onClick={() => onDelete(chat)}>
            <Trash2Icon aria-hidden="true" />
            {t("workspace:assistant.history.delete")}
          </MenuItem>
        </MenuPopup>
      </Menu>
    </li>
  );
}
