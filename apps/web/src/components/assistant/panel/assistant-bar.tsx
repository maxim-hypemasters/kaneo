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
    // A 1px violet ring with a beam circling it, around a faintly tinted
    // surface. The beam only rotates (composited, no repaint) and stops
    // under reduced motion, leaving the static ring and glow.
    <div className="relative isolate overflow-hidden rounded-xl bg-(--beam-a)/30 p-px shadow-[0_0_20px_-6px_var(--beam-a)] transition-[opacity,box-shadow] duration-150 ease-out [--beam-a:var(--color-violet-500)] [--beam-b:var(--color-fuchsia-500)] hover:shadow-[0_0_28px_-4px_var(--beam-a)] has-focus-visible:ring-[3px] has-focus-visible:ring-(--beam-a)/32 starting:opacity-0 motion-reduce:transition-none dark:[--beam-a:var(--color-violet-400)] dark:[--beam-b:var(--color-fuchsia-400)]">
      <span
        aria-hidden="true"
        className="-z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[max(150%,40rem)] animate-assistant-beam bg-[conic-gradient(from_0deg,transparent_0deg,var(--beam-a)_50deg,var(--beam-b)_90deg,transparent_140deg)] will-change-transform motion-reduce:hidden"
      />
      <div className="relative flex h-13.5 items-center gap-3 rounded-[calc(var(--radius-xl)-1px)] bg-[color-mix(in_oklab,var(--beam-a)_4%,var(--background))] px-4 dark:bg-[color-mix(in_oklab,var(--beam-a)_8%,var(--card))]">
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
            className="size-4 shrink-0 animate-assistant-twinkle text-(--beam-a) motion-reduce:animate-none"
          />
          <span id={labelId} className="sr-only">
            {t("workspace:assistant.bar.open")}
          </span>
          <span
            id={placeholderId}
            className="truncate text-base text-foreground/70 sm:text-sm"
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
    </div>
  );
}
