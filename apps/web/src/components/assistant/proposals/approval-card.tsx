import { CircleSlashIcon, SquarePenIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";
import { ApprovalActions } from "./approval-actions";
import { ApprovalFields } from "./approval-fields";
import { proposalTitleKey } from "./proposal-copy";
import { ProposalDiff } from "./proposal-diff";
import { ProposalNested } from "./proposal-nested";
import { ProposalOutcome } from "./proposal-outcome";
import { proposalState } from "./proposal-state";
import { visibleFields } from "./visible-fields";

type ApprovalCardProps = {
  message: AssistantMessage;
  workspaceSlug: string | undefined;
  /** No decision can be made now: one is on its way, or an answer runs. */
  disabled: boolean;
  /** The decision on its way for this card: true approves, false rejects. */
  deciding: boolean | null;
  /** Decided in this session, so a failure is announced. */
  justDecided: boolean;
  onDecide: (messageId: string, approve: boolean) => void;
};

/**
 * A change the assistant proposed, exactly as the server will run it, with
 * Approve and Reject while it waits. Afterwards it shows how it went; a
 * rejected or skipped change folds into one muted line.
 */
export function ApprovalCard({
  message,
  workspaceSlug,
  disabled,
  deciding,
  justDecided,
  onDecide,
}: ApprovalCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const state = proposalState(message);
  const preview = message.preview;
  const title = t(proposalTitleKey(message.toolName, preview), {
    target: preview?.target ?? "",
  });

  if (state === "rejected" || state === "skipped") {
    return (
      <div
        role="group"
        aria-labelledby={titleId}
        className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs"
      >
        <CircleSlashIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span id={titleId} className="min-w-0 truncate">
          {title}
        </span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">
          {state === "rejected"
            ? t("workspace:assistant.proposal.rejected")
            : t("workspace:assistant.proposal.skipped")}
        </span>
      </div>
    );
  }

  const fields = preview ? visibleFields(preview) : [];
  const hasBody =
    fields.length > 0 || Boolean(preview?.diff) || Boolean(preview?.nested);

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      aria-busy={deciding !== null || undefined}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-background shadow-xs/5"
    >
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
        <SquarePenIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        {/* Focus lands here after a decision on another card. */}
        <h3
          id={titleId}
          tabIndex={-1}
          data-pending-proposal={state === "pending" ? "" : undefined}
          className="min-w-0 flex-1 break-words rounded-sm font-medium text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title}
        </h3>
      </div>
      {hasBody ? (
        <div className="flex min-w-0 flex-col gap-3 px-3 pb-3">
          <ApprovalFields fields={fields} workspaceSlug={workspaceSlug} />
          {preview?.diff ? (
            <ProposalDiff
              before={preview.diff.before}
              after={preview.diff.after}
            />
          ) : null}
          {preview?.nested ? <ProposalNested nested={preview.nested} /> : null}
        </div>
      ) : null}
      {state === "pending" ? (
        <ApprovalActions
          titleId={titleId}
          disabled={disabled}
          deciding={deciding}
          onDecide={(approve) => onDecide(message.id, approve)}
        />
      ) : (
        <ProposalOutcome
          state={state}
          message={message}
          workspaceSlug={workspaceSlug}
          announce={justDecided}
        />
      )}
    </div>
  );
}
