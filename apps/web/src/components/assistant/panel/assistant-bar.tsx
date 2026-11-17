import { Loader2Icon, SparklesIcon } from "lucide-react";
import { type Ref, useId } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAssistantChat } from "@/hooks/queries/assistant/use-assistant-chat";
import { isMacPlatform } from "@/lib/shortcuts/platform";
import { typesText } from "./types-text";

type AssistantBarProps = {
  workspaceId: string;
  /** The open chat, whose changes waiting for approval the bar counts. */
  chatId: string | null;
  /** The chat it opens, for aria-controls. */
  controlsId: string;
  /** A turn is streaming in this panel. */
  answering: boolean;
  /** Opens the chat and moves focus to the composer. */
  onOpen: () => void;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * The minimized assistant on Home: one row that looks like the composer and
 * opens the chat when chosen or typed into. While minimized it says that an
 * answer is on its way or that changes wait for approval.
 */
export function AssistantBar({
  workspaceId,
  chatId,
  controlsId,
  answering,
  onOpen,
  ref,
}: AssistantBarProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const placeholderId = useId();
  const statusId = useId();
  // Only the bar reads the chat: the open chat fetches for itself, and a
  // streaming turn keeps the cache current.
  const { data: openChat } = useAssistantChat(workspaceId, chatId, {
    paused: answering,
  });
  const pendingCount = chatId ? (openChat?.pendingCount ?? 0) : 0;

  return (
    <div className="relative flex h-12 items-center gap-3 rounded-xl border border-input bg-background px-4 shadow-xs/5 transition-[opacity,border-color,box-shadow] duration-150 ease-out hover:border-ring/48 has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/24 starting:opacity-0 motion-reduce:transition-none dark:bg-input/32">
      <button
        ref={ref}
        type="button"
        aria-expanded={false}
        aria-controls={controlsId}
        // The visible prompt is part of the name, for voice control.
        aria-labelledby={`${labelId} ${placeholderId}`}
        aria-describedby={statusId}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onOpen();
            return;
          }
          const text = typesText({
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
            altGraph: event.getModifierState("AltGraph"),
            mac: isMacPlatform(),
            isComposing: event.nativeEvent.isComposing,
            keyCode: event.keyCode,
          });
          // The composer takes focus before this handler returns and the
          // key's default goes on, so the browser types the key there as the
          // keyboard makes it, Option and AltGr characters included.
          if (text) flushSync(onOpen);
        }}
        // The click area covers the whole bar, status included.
        className="flex min-w-0 flex-1 cursor-text items-center gap-2.5 self-stretch text-start outline-none after:absolute after:inset-0 after:rounded-xl"
      >
        <SparklesIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span id={labelId} className="sr-only">
          {t("workspace:assistant.bar.open")}
        </span>
        <span
          id={placeholderId}
          className="truncate text-base text-muted-foreground sm:text-sm"
        >
          {t("workspace:assistant.bar.placeholder")}
        </span>
      </button>
      <span
        id={statusId}
        role="status"
        className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs"
      >
        {answering ? (
          <>
            <Loader2Icon
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
            {t("workspace:assistant.bar.answering")}
          </>
        ) : pendingCount > 0 ? (
          <>
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-info"
            />
            {t("workspace:assistant.bar.pending", { count: pendingCount })}
          </>
        ) : null}
      </span>
    </div>
  );
}
