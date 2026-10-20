import { openMilestoneDetails } from "@/store/milestone-details";
import { getPriorityIcon } from "@/lib/priority";
import { Diamond, Ellipsis, ArrowUpRight } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import type { Milestone } from "@/fetchers/milestone/milestones";
import { cn } from "@/lib/cn";
import { milestoneDateLabel } from "./milestone-date-label";
export function MilestoneRow({
  milestone,
  projectId,
  planningLabel,
  selected,
  canEdit,
  first,
  last,
  pending,
  onSelect,
  onEdit,
  onDelete,
  onMove,
}: {
  milestone: Milestone;
  projectId: string;
  planningLabel?: string;
  selected: boolean;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  pending: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const selectingDialog = useRef(false);
  const { total, started, completed } = milestone.progress;
  const dates = milestoneDateLabel(milestone, t);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md hover:bg-accent/50",
        selected && "bg-accent/50",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Diamond
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            started > 0 && "text-amber-500",
            total > 0 && completed === total && "fill-primary text-primary",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate" title={milestone.title}>
            {milestone.title}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {getPriorityIcon(milestone.priority ?? "no-priority")}
            <span className="truncate">
              {planningLabel ??
                milestone.status ??
                t("tasks:milestones.planned")}
            </span>
          </span>
          {dates && (
            <span
              className="block truncate text-xs text-muted-foreground"
              title={[milestone.startDate, milestone.endDate]
                .filter(Boolean)
                .join(" – ")}
            >
              {dates}
            </span>
          )}
        </span>
        <span
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
          aria-label={t("tasks:milestones.progress", {
            total,
            started,
            completed,
          })}
        >
          {percent}% · {completed}/{total}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("tasks:milestones.open")}
        onClick={() => openMilestoneDetails(projectId, milestone.id)}
      >
        <ArrowUpRight className="size-3.5" />
      </Button>
      {canEdit && (
        <Menu
          onOpenChange={(open) => {
            if (open) selectingDialog.current = false;
          }}
        >
          <MenuTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t("tasks:milestones.actions")}
              />
            }
          >
            <Ellipsis className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" finalFocus={() => !selectingDialog.current}>
            <MenuItem
              onClick={() => {
                selectingDialog.current = true;
                onEdit();
              }}
            >
              {t("tasks:milestones.edit")}
            </MenuItem>
            <MenuItem disabled={first || pending} onClick={() => onMove(-1)}>
              {t("tasks:milestones.moveUp")}
            </MenuItem>
            <MenuItem disabled={last || pending} onClick={() => onMove(1)}>
              {t("tasks:milestones.moveDown")}
            </MenuItem>
            <MenuItem
              variant="destructive"
              onClick={() => {
                selectingDialog.current = true;
                onDelete();
              }}
            >
              {t("tasks:milestones.delete")}
            </MenuItem>
          </MenuPopup>
        </Menu>
      )}
    </div>
  );
}
