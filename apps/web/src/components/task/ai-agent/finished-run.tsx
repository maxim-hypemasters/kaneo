import {
  CircleCheckIcon,
  CircleSlashIcon,
  CircleXIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentRun, AgentRunEvent } from "@/fetchers/agent/get-task-agent";
import { getExternalWebUrl } from "@/lib/external-url";
import { RunLogDisclosure } from "./run-log-disclosure";
import { runStatusKey } from "./run-status-key";

type FinishedRunProps = {
  run: AgentRun;
  events: AgentRunEvent[];
};

// Another Ship or Start goes through the start actions.
export function FinishedRun({ run, events }: FinishedRunProps) {
  const { t } = useTranslation();

  if (run.status === "succeeded") {
    const prUrl = run.result ? getExternalWebUrl(run.result.prUrl) : null;
    return (
      <div className="space-y-1 border-border/70 border-t px-2 pt-2 pb-1 text-sm">
        <p className="inline-flex flex-wrap items-center gap-1.5">
          <CircleCheckIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-success-foreground"
          />
          <span className="font-medium">{t(runStatusKey(run))}</span>
          {prUrl ? (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {t("tasks:aiAgent.run.viewPullRequest")}
              <ExternalLinkIcon aria-hidden="true" className="size-3" />
            </a>
          ) : null}
        </p>
        {run.result?.summary ? (
          <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground text-xs">
            {run.result.summary}
          </p>
        ) : null}
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="space-y-2 border-border/70 border-t px-2 pt-2 pb-1 text-sm">
        <p className="inline-flex items-center gap-1.5 font-medium">
          <CircleXIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-destructive-foreground"
          />
          {t(runStatusKey(run))}
        </p>
        <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
          {run.error ?? t("tasks:aiAgent.run.failedFallback")}
        </p>
        <RunLogDisclosure events={events} />
      </div>
    );
  }

  if (run.status === "cancelled") {
    return (
      <div className="space-y-2 border-border/70 border-t px-2 pt-2 pb-1">
        <p className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
          <CircleSlashIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {t(runStatusKey(run))}
        </p>
        <RunLogDisclosure events={events} />
      </div>
    );
  }

  return null;
}
