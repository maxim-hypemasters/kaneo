import {
  ChevronDownIcon,
  RefreshCwIcon,
  RocketIcon,
  SparklesIcon,
} from "lucide-react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { useRequestTaskAssessment } from "@/hooks/mutations/agent/use-request-task-assessment";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import { assessState } from "./assess-state";
import { verdictDisplay } from "./readiness-display";
import { ReadinessMeter } from "./readiness-meter";
import { ReadinessStatus } from "./readiness-status";
import { RunnerNote } from "./runner-note";
import { useIsUpcoming } from "./use-is-upcoming";

type ReadinessBarProps = {
  taskId: string;
  agent: TaskAgent;
  canUpdate: boolean;
  canManageSettings: boolean;
  panelId: string;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onShip: (button: HTMLElement) => void;
  /** Takes focus when the Ship dialog closes after its button went away. */
  summaryRef: RefObject<HTMLSpanElement | null>;
};

export function ReadinessBar({
  taskId,
  agent,
  canUpdate,
  canManageSettings,
  panelId,
  panelOpen,
  onTogglePanel,
  onShip,
  summaryRef,
}: ReadinessBarProps) {
  const { t } = useTranslation();
  const { mutate: requestAssessment, isPending } = useRequestTaskAssessment();
  const scheduled = useIsUpcoming(agent.assessScheduledAt);
  const state = assessState(agent, scheduled);
  const waiting = state === "assessing" || state === "scheduled";
  const busy = isPending || state === "assessing";
  const { assessment, stale, ship } = agent;
  const display = assessment ? verdictDisplay(assessment.verdict) : null;
  const questionCount = assessment?.questions.length ?? 0;

  // A scheduled check starts now instead of waiting out the edit window.
  const check = () =>
    requestAssessment(taskId, {
      onError: () => toast.error(t("tasks:aiAgent.errors.assess")),
    });

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <SparklesIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span
          ref={summaryRef}
          tabIndex={-1}
          className="rounded-sm font-medium text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {assessment
            ? t("tasks:aiAgent.readiness", { score: assessment.score })
            : t("tasks:aiAgent.readinessTitle")}
        </span>
        {display ? (
          <Badge variant={display.tone}>{t(display.labelKey)}</Badge>
        ) : null}
        {waiting ? null : stale ? (
          <Badge variant="outline">{t("tasks:aiAgent.outdated")}</Badge>
        ) : assessment ? null : (
          <span className="text-muted-foreground text-xs">
            {t("tasks:aiAgent.notAssessed")}
          </span>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-1.5">
          {/* Stays mounted and focusable while a check runs (a disabled
              button drops focus), and ignores presses until it ends. */}
          {canUpdate && state !== "runnerMissing" ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-disabled={busy || undefined}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-64"
              onClick={busy ? undefined : check}
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={cn(busy && "animate-spin")}
              />
              {assessment && state !== "scheduled"
                ? t("tasks:aiAgent.checkAgain")
                : t("tasks:aiAgent.checkNow")}
            </Button>
          ) : null}
          {assessment ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-expanded={panelOpen}
              aria-controls={panelId}
              onClick={onTogglePanel}
            >
              {questionCount > 0
                ? t("tasks:aiAgent.questionCount", { count: questionCount })
                : t("tasks:aiAgent.details")}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "transition-transform duration-150",
                  panelOpen && "rotate-180",
                )}
              />
            </Button>
          ) : null}
          {canUpdate && ship.canShip ? (
            <Button
              type="button"
              size="xs"
              onClick={(event) => onShip(event.currentTarget)}
            >
              <RocketIcon aria-hidden="true" />
              {t("tasks:aiAgent.ship")}
            </Button>
          ) : null}
        </div>
      </div>
      <ReadinessStatus state={state} failure={agent.lastAssessFailure} />
      <RunnerNote
        runner={agent.runner}
        waiting={waiting}
        canManageSettings={canManageSettings}
      />
      <ReadinessMeter
        score={assessment?.score ?? null}
        tone={display?.tone ?? null}
        label={t("tasks:aiAgent.meterLabel")}
        dimmed={stale || waiting}
      />
    </div>
  );
}
