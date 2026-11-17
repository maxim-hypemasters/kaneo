import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { ToolStep } from "./build-conversation-items";
import { ToolStepChip } from "./tool-step-chip";

type ToolStepsProps = {
  steps: ToolStep[];
  // Steps of the answer still being written stay open; finished runs of two
  // or more fold into one line.
  live: boolean;
};

export function ToolSteps({ steps, live }: ToolStepsProps) {
  const { t } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const collapsible = !live && steps.length > 1;
  const expanded = !collapsible || open;

  return (
    <div className="flex flex-col items-start gap-1.5">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform duration-150 motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
          {t("workspace:assistant.steps.lookedAt", { count: steps.length })}
        </button>
      ) : null}
      {expanded ? (
        <ul
          id={listId}
          aria-label={t("workspace:assistant.steps.label")}
          className="flex flex-wrap gap-1.5"
        >
          {steps.map((step) => (
            <ToolStepChip key={step.id} step={step} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
