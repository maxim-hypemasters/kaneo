import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type ShowAllButtonProps = {
  expanded: boolean;
  onToggle: () => void;
  /** The id of what it folds. */
  controls: string;
};

// Unfolds long text or a long diff on a card, and folds it again.
export function ShowAllButton({
  expanded,
  onToggle,
  controls,
}: ShowAllButtonProps) {
  const { t } = useTranslation();
  return (
    <Button
      variant="link"
      size="xs"
      className="h-auto px-0 text-muted-foreground hover:text-foreground"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      {expanded
        ? t("workspace:assistant.proposal.showLess")
        : t("workspace:assistant.proposal.showAll")}
    </Button>
  );
}
