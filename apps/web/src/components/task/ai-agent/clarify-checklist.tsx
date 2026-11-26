import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AgentChecklistItem } from "@/fetchers/agent/get-task-agent";

const STATUS_DISPLAY: Record<
  AgentChecklistItem["status"],
  { variant: "success" | "warning" | "error"; labelKey: string }
> = {
  met: { variant: "success", labelKey: "tasks:aiAgent.checklist.met" },
  partial: { variant: "warning", labelKey: "tasks:aiAgent.checklist.partial" },
  missing: { variant: "error", labelKey: "tasks:aiAgent.checklist.missing" },
};

type ClarifyChecklistProps = {
  items: AgentChecklistItem[];
};

export function ClarifyChecklist({ items }: ClarifyChecklistProps) {
  const { t } = useTranslation();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3
        id={headingId}
        className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
      >
        {t("tasks:aiAgent.checklist.title")}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const status = STATUS_DISPLAY[item.status];
          return (
            <li key={item.key} className="flex items-start gap-2 text-sm">
              <Badge variant={status.variant} className="mt-px w-16">
                {t(status.labelKey)}
              </Badge>
              <div className="min-w-0 flex-1">
                <p>{item.label}</p>
                {item.note ? (
                  <p className="text-muted-foreground text-xs">{item.note}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
