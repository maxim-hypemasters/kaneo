import { Loader2Icon } from "lucide-react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type {
  AgentRun,
  AgentRunEvent,
  TaskAgent,
} from "@/fetchers/agent/get-task-agent";
import { useCancelTaskShip } from "@/hooks/mutations/agent/use-cancel-task-ship";
import { AgentRunLog } from "./agent-run-log";

type ActiveRunProps = {
  taskId: string;
  run: AgentRun;
  events: AgentRunEvent[];
  runner: TaskAgent["runner"];
  canUpdate: boolean;
  /** Focused after shipping, since the Ship button is gone by then. */
  statusRef: RefObject<HTMLParagraphElement | null>;
};

export function ActiveRun({
  taskId,
  run,
  events,
  runner,
  canUpdate,
  statusRef,
}: ActiveRunProps) {
  const { t } = useTranslation();
  const cancel = useCancelTaskShip();
  const stopping = run.cancelRequested || cancel.isPending;

  return (
    <div className="space-y-2 border-border border-t px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p
          ref={statusRef}
          tabIndex={-1}
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-sm font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Loader2Icon
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin text-muted-foreground"
          />
          {run.status === "queued"
            ? t("tasks:aiAgent.run.queued")
            : t("tasks:aiAgent.run.working")}
        </p>
        {canUpdate ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={stopping}
            onClick={() => cancel.mutate(taskId)}
          >
            {stopping
              ? t("tasks:aiAgent.run.stopping")
              : t("tasks:aiAgent.run.cancel")}
          </Button>
        ) : null}
      </div>
      {/* Without a runner the readiness bar already says one is missing. */}
      {run.status === "queued" && runner.configured && !runner.online ? (
        <p className="text-muted-foreground text-xs">
          {t("tasks:aiAgent.runnerOffline")}
        </p>
      ) : null}
      <AgentRunLog events={events} />
    </div>
  );
}
