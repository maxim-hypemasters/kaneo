import { SparklesIcon } from "lucide-react";
import { type ReactNode, type RefObject, useId } from "react";
import { useTranslation } from "react-i18next";
import { railCardClassName } from "@/components/common/rail-card";
import { Badge } from "@/components/ui/badge";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { cn } from "@/lib/cn";
import { assessState } from "./assess-state";
import { CheckReadinessButton } from "./check-readiness-button";
import { verdictDisplay } from "./readiness-display";
import { ReadinessMeter } from "./readiness-meter";
import { ReadinessStatus } from "./readiness-status";
import { RunnerNote } from "./runner-note";
import { useIsUpcoming } from "./use-is-upcoming";

type ReadinessCardProps = {
  taskId: string;
  agent: TaskAgent;
  canUpdate: boolean;
  canManageSettings: boolean;
  /** Takes focus when the button that had it went away. */
  scoreRef: RefObject<HTMLHeadingElement | null>;
  /** Start actions, Ship blockers and the run status. */
  children?: ReactNode;
};

export function ReadinessCard({
  taskId,
  agent,
  canUpdate,
  canManageSettings,
  scoreRef,
  children,
}: ReadinessCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const scheduled = useIsUpcoming(agent.assessScheduledAt);
  const state = assessState(agent, scheduled);
  const waiting = state === "assessing" || state === "scheduled";
  const { assessment, stale } = agent;
  const display = assessment ? verdictDisplay(assessment.verdict) : null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(railCardClassName, "flex flex-col gap-1.5")}
    >
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 ps-2">
        <SparklesIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <h2
          id={headingId}
          ref={scoreRef}
          tabIndex={-1}
          className="rounded-sm font-medium text-muted-foreground text-xs uppercase tabular-nums tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {assessment
            ? t("tasks:aiAgent.readiness", { score: assessment.score })
            : t("tasks:aiAgent.readinessTitle")}
        </h2>
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
        {canUpdate && state !== "runnerMissing" ? (
          <div className="ms-auto">
            <CheckReadinessButton
              taskId={taskId}
              assessing={state === "assessing"}
              again={assessment !== null && state !== "scheduled"}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 px-2 pb-1">
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
      {children}
    </section>
  );
}
