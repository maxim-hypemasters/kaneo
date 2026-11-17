import { CheckIcon, CircleDashedIcon, Loader2Icon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { ToolStep } from "./build-conversation-items";
import { toolLabelKey } from "./tool-label";

const STATUS_KEYS = {
  running: "workspace:assistant.steps.running",
  done: "workspace:assistant.steps.done",
  error: "workspace:assistant.steps.failed",
  stopped: "workspace:assistant.steps.stopped",
} as const;

// One read the assistant ran: what it looked at, and how that went.
export function ToolStepChip({ step }: { step: ToolStep }) {
  const { t } = useTranslation();
  const Icon = {
    running: Loader2Icon,
    done: CheckIcon,
    error: XIcon,
    stopped: CircleDashedIcon,
  }[step.status];

  return (
    <li
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
        step.status === "error"
          ? "border-destructive/30 bg-destructive/4 text-destructive-foreground"
          : "border-border/70 bg-muted/40 text-muted-foreground",
      )}
      title={step.errorText ?? undefined}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3 shrink-0",
          step.status === "running" &&
            "animate-spin motion-reduce:animate-none",
          step.status === "done" && "text-success-foreground",
        )}
      />
      <span className="truncate">{t(toolLabelKey(step.name))}</span>
      <span className="sr-only">: {t(STATUS_KEYS[step.status])}</span>
      {step.errorText ? (
        <span className="min-w-0 truncate text-destructive-foreground/80">
          · {step.errorText}
        </span>
      ) : null}
    </li>
  );
}
