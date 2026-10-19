import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type BacklogToolbarActionsProps = {
  onMoveAll: () => void;
};

export function BacklogToolbarActions({
  onMoveAll,
}: BacklogToolbarActionsProps) {
  const { t } = useTranslation();
  const moveAllLabel = t("tasks:backlog.moveAllTooltip");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={moveAllLabel}
            onClick={onMoveAll}
          />
        }
      >
        <ArrowRight />
      </TooltipTrigger>
      <TooltipContent>{moveAllLabel}</TooltipContent>
    </Tooltip>
  );
}
