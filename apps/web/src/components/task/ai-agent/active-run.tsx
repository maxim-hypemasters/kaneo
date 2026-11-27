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
import { runStatusKey } from "./run-status-key";

type ActiveRunProps = {
  taskId: string;
  projectId: string;
  run: AgentRun;
  events: AgentRunEvent[];
  runner: TaskAgent["runner"];
  canUpdate: boolean;
  /** Focused after Ship or Start, since their buttons are gone by then. */
  statusRef: RefObject<HTMLParagraphElement | null>;
};

export function ActiveRun({
  taskId,
  projectId,
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
    <div className="space-y-2 border-border/70 border-t px-2 pt-2 pb-1">
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
          {t(runStatusKey(run))}
        </p>
        {canUpdate ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={stopping}
            onClick={() => cancel.mutate({ taskId, projectId })}
          >
            {stopping
              ? t("tasks:aiAgent.run.stopping")
              : t("tasks:aiAgent.run.cancel")}
          </Button>
        ) : null}
      </div>
      {/* Without a runner the readiness card already says one is missing. */}
      {run.status === "queued" && runner.configured && !runner.online ? (
        <p className="text-muted-foreground text-xs">
          {t("tasks:aiAgent.runnerOffline")}
        </p>
      ) : null}
      <AgentRunLog events={events} />
    </div>
  );
}
