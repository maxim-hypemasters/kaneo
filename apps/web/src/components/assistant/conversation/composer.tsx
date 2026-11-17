import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type KeyboardEvent, type RefObject, useCallback, useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAutoGrowTextarea } from "@/hooks/use-auto-grow-textarea";
import { cn } from "@/lib/cn";
import { type ComposerKey, composerKeyAction } from "./composer-keys";

// Mirrors MAX_USER_MESSAGE_CHARS in apps/api/src/assistant/constants.ts.
export const MAX_MESSAGE_CHARS = 8000;
const COUNTER_FROM = MAX_MESSAGE_CHARS - 1000;

const composerKey = (event: KeyboardEvent): ComposerKey => ({
  key: event.key,
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  isComposing: event.nativeEvent.isComposing,
  keyCode: event.keyCode,
});

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** This chat's answer is streaming: the button stops it. */
  streaming: boolean;
  /** False while another answer runs, so nothing new can start. */
  canSend: boolean;
  /** Proposed changes a new message would skip. */
  pendingCount?: number;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  canSend,
  pendingCount = 0,
  textareaRef,
}: ComposerProps) {
  const { t, i18n } = useTranslation();
  const hintId = useId();
  const counterId = useId();
  const autoGrowRef = useAutoGrowTextarea(value);
  const setTextarea = useCallback(
    (node: HTMLTextAreaElement | null) => {
      autoGrowRef.current = node;
      textareaRef.current = node;
    },
    [autoGrowRef, textareaRef],
  );

  const length = value.length;
  const tooLong = length > MAX_MESSAGE_CHARS;
  const ready = canSend && !streaming && value.trim() !== "" && !tooLong;
  const number = (count: number) => count.toLocaleString(i18n.language);

  const submit = () => {
    if (ready) onSend();
  };
  const actionLabel = streaming
    ? t("workspace:assistant.composer.stop")
    : t("workspace:assistant.composer.send");

  return (
    <form
      className="shrink-0 border-border/60 border-t px-3 pt-3 pb-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      // Escape stops from the text and from the Stop button alike.
      onKeyDown={(event) => {
        if (composerKeyAction(composerKey(event), { streaming }) === "stop") {
          event.preventDefault();
          onStop();
        }
      }}
    >
      <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-1.5 ps-0.5 shadow-xs/5 transition-shadow has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-[3px] has-[textarea:focus-visible]:ring-ring/24 dark:bg-input/32">
        <textarea
          ref={setTextarea}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              composerKeyAction(composerKey(event), { streaming }) === "send"
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={t("workspace:assistant.composer.placeholder")}
          aria-label={t("workspace:assistant.composer.label")}
          aria-describedby={`${hintId} ${counterId}`}
          aria-invalid={tooLong || undefined}
          className="max-h-48 min-h-11 min-w-0 flex-1 resize-none appearance-none overflow-y-auto border-0 bg-transparent px-2.5 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {/*
          One button that turns from Send into Stop and back, so focus stays
          on it. It is never natively disabled, which would drop focus when a
          finished answer turns Stop back into an unusable Send.
        */}
        <Button
          type={streaming ? "button" : "submit"}
          variant={streaming ? "secondary" : "default"}
          onClick={streaming ? onStop : undefined}
          aria-disabled={!streaming && !ready ? true : undefined}
          className="size-11 shrink-0 rounded-full aria-disabled:pointer-events-none aria-disabled:opacity-64 aria-disabled:shadow-none aria-disabled:inset-shadow-none"
          aria-label={actionLabel}
          title={actionLabel}
        >
          {streaming ? (
            <SquareIcon aria-hidden="true" className="size-3.5 fill-current" />
          ) : (
            <ArrowUpIcon aria-hidden="true" />
          )}
        </Button>
      </div>
      <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-1 text-muted-foreground text-xs">
        {pendingCount > 0 ? (
          <span id={hintId} className="text-warning-foreground">
            {t("workspace:assistant.composer.skipsPending", {
              count: pendingCount,
            })}
          </span>
        ) : (
          <span id={hintId} className="max-sm:sr-only">
            {t("workspace:assistant.composer.hint")}
          </span>
        )}
        <span
          id={counterId}
          className={cn(
            "ms-auto tabular-nums",
            tooLong && "font-medium text-destructive-foreground",
          )}
        >
          {length >= COUNTER_FROM
            ? t("workspace:assistant.composer.counter", {
                used: number(length),
                max: number(MAX_MESSAGE_CHARS),
              })
            : null}
          {tooLong ? (
            <span className="sr-only">
              {" "}
              {t("workspace:assistant.composer.tooLong", {
                max: number(MAX_MESSAGE_CHARS),
              })}
            </span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
