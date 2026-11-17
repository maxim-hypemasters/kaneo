import { UserRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type ApprovalActionsProps = {
  /** The card's title, which tells the buttons of different cards apart. */
  titleId: string;
  disabled: boolean;
  /** The decision on its way for this card: true approves, false rejects. */
  deciding: boolean | null;
  onDecide: (approve: boolean) => void;
};

// A pending card's footer. The change runs with the user's own permissions.
export function ApprovalActions({
  titleId,
  disabled,
  deciding,
  onDecide,
}: ApprovalActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 border-border/60 border-t bg-muted/30 px-3 py-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground text-xs">
        <UserRoundIcon aria-hidden="true" className="size-3.5 shrink-0" />
        {t("workspace:assistant.proposal.runsAsYou")}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        loading={deciding === false}
        aria-describedby={titleId}
        onClick={() => onDecide(false)}
      >
        {t("workspace:assistant.proposal.reject")}
      </Button>
      <Button
        size="sm"
        disabled={disabled}
        loading={deciding === true}
        aria-describedby={titleId}
        onClick={() => onDecide(true)}
      >
        {t("workspace:assistant.proposal.approve")}
      </Button>
    </div>
  );
}
