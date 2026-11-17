import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type ApprovalBatchBarProps = {
  /** Changes waiting for a decision. The bar shows from two on. */
  count: number;
  disabled: boolean;
  /** A decision on all of them is on its way: true approves, false rejects. */
  deciding: boolean | null;
  onDecideAll: (approve: boolean) => void;
};

// Decides every waiting change at once, so a long plan needs two clicks,
// not one per card.
export function ApprovalBatchBar({
  count,
  disabled,
  deciding,
  onDecideAll,
}: ApprovalBatchBarProps) {
  const { t } = useTranslation();
  const labelId = useId();
  if (count < 2) return null;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-xs/5"
    >
      <p
        id={labelId}
        className="min-w-0 flex-1 font-medium text-foreground text-sm"
      >
        {t("workspace:assistant.proposal.batch.waiting", { count })}
      </p>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        loading={deciding === false}
        onClick={() => onDecideAll(false)}
      >
        {t("workspace:assistant.proposal.batch.rejectAll")}
      </Button>
      <Button
        size="sm"
        disabled={disabled}
        loading={deciding === true}
        onClick={() => onDecideAll(true)}
      >
        {t("workspace:assistant.proposal.batch.approveAll")}
      </Button>
    </div>
  );
}
