import { CircleAlertIcon, CircleCheckIcon, CircleHelpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";
import { MarkdownLink } from "../conversation/markdown-link";
import type { ProposalState } from "./proposal-state";

type ProposalOutcomeProps = {
  state: Extract<ProposalState, "succeeded" | "failed" | "unknown">;
  message: Pick<AssistantMessage, "errorText" | "resultSummary">;
  workspaceSlug: string | undefined;
  /** Decided in this session: a failure is news and interrupts as an alert. */
  announce: boolean;
};

// How an approved change went: what it made with a link to it, why it
// failed, or that it may or may not have run. A failure loaded with the
// chat's history is plain text, not an alert.
export function ProposalOutcome({
  state,
  message,
  workspaceSlug,
  announce,
}: ProposalOutcomeProps) {
  const { t } = useTranslation();

  if (state === "succeeded" && message.resultSummary) {
    const { label, href } = message.resultSummary;
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-border/60 border-t px-3 py-2 text-sm">
        <CircleCheckIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-success-foreground"
        />
        <span className="min-w-0 flex-1 break-words">{label}</span>
        {href ? (
          <MarkdownLink href={href} workspaceSlug={workspaceSlug}>
            {t("workspace:assistant.proposal.open")}{" "}
            <span className="sr-only">{label}</span>
          </MarkdownLink>
        ) : null}
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div
        role={announce ? "alert" : undefined}
        className="flex items-start gap-2 border-destructive/30 border-t bg-destructive/4 px-3 py-2 text-sm"
      >
        <CircleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-destructive-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="text-foreground">
            {t("workspace:assistant.proposal.failed")}
          </p>
          {message.errorText ? (
            <p className="break-words text-muted-foreground text-xs">
              {message.errorText}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 border-border/60 border-t bg-warning/8 px-3 py-2 text-sm">
      <CircleHelpIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-warning-foreground"
      />
      <p className="min-w-0 flex-1 text-foreground">
        {t("workspace:assistant.proposal.unknown")}
      </p>
    </div>
  );
}
