import { ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AgentRunEvent } from "@/fetchers/agent/get-task-agent";
import { cn } from "@/lib/cn";
import { AgentRunLog } from "./agent-run-log";

type RunLogDisclosureProps = {
  events: AgentRunEvent[];
};

// A finished run keeps its log behind a toggle, to show where it stopped.
export function RunLogDisclosure({ events }: RunLogDisclosureProps) {
  const { t } = useTranslation();

  if (events.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "xs" }),
          "-ms-2 text-muted-foreground data-panel-open:[&_svg]:rotate-180",
        )}
      >
        {t("tasks:aiAgent.run.logLabel")}
        <ChevronDownIcon
          aria-hidden="true"
          className="transition-transform duration-150"
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="pt-1.5">
          <AgentRunLog events={events} />
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
