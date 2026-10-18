import { ArrowRightLeft } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMoveUnfinished } from "@/hooks/mutations/release/use-move-unfinished";
import { sortReleases } from "@/lib/releases/sort-releases";
import { NO_RELEASE } from "@/lib/task-filters/release-filter-values";
import { toast } from "@/lib/toast";
import type { Release } from "@/types/release";
import { pickMoveTarget } from "./pick-move-target";

type MoveUnfinishedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: Release;
  // The project's releases.
  releases: readonly Release[];
  // How many items would move, as the board shows them now.
  unfinished: number;
  today: string;
};

const SECTIONS = [
  { id: "active", labelKey: "tasks:releases.sections.active" },
  { id: "upcoming", labelKey: "tasks:releases.sections.upcoming" },
  { id: "past", labelKey: "tasks:releases.sections.past" },
] as const;

export function MoveUnfinishedDialog({
  open,
  onOpenChange,
  release,
  releases,
  unfinished,
  today,
}: MoveUnfinishedDialogProps) {
  const { t } = useTranslation();
  const targetLabelId = useId();
  const moveUnfinished = useMoveUnfinished();
  const others = releases.filter((other) => other.id !== release.id);
  // Undefined until the viewer picks, so each opening starts at the default.
  const [chosen, setChosen] = useState<string>();
  const target = chosen ?? pickMoveTarget(releases, release) ?? NO_RELEASE;
  const sections = sortReleases(others, today);
  const targetRelease = others.find((other) => other.id === target);
  // A target deleted while the dialog is open falls back to no release.
  const targetReleaseId = targetRelease?.id ?? null;

  const handleConfirm = async () => {
    try {
      const { movedTaskIds } = await moveUnfinished.mutateAsync({
        id: release.id,
        projectId: release.projectId,
        targetReleaseId,
      });
      const count = movedTaskIds.length;
      toast.success(
        targetRelease
          ? t("tasks:releases.moveUnfinished.success", {
              count,
              name: targetRelease.name,
            })
          : t("tasks:releases.moveUnfinished.successNoRelease", { count }),
        { icon: ArrowRightLeft },
      );
      setChosen(undefined);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:releases.moveUnfinished.error"),
      );
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && moveUnfinished.isPending) return;
        if (!next) setChosen(undefined);
        onOpenChange(next);
      }}
      title={t("tasks:releases.moveUnfinished.title")}
      description={t("tasks:releases.moveUnfinished.description", {
        name: release.name,
      })}
      confirmLabel={t("tasks:releases.moveUnfinished.confirm")}
      pending={moveUnfinished.isPending}
      destructive={false}
      confirmDisabled={unfinished === 0}
      onConfirm={handleConfirm}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <span id={targetLabelId} className="block font-medium text-sm">
            {t("tasks:releases.moveUnfinished.target")}
          </span>
          <Select
            value={targetRelease ? target : NO_RELEASE}
            onValueChange={(value) => {
              if (typeof value === "string") setChosen(value);
            }}
          >
            <SelectTrigger aria-labelledby={targetLabelId}>
              <SelectValue>
                {targetRelease?.name ??
                  t("tasks:releases.moveUnfinished.noRelease")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_RELEASE}>
                {t("tasks:releases.moveUnfinished.noRelease")}
              </SelectItem>
              {SECTIONS.map(({ id, labelKey }) =>
                sections[id].length > 0 ? (
                  <SelectGroup key={id}>
                    <SelectGroupLabel>{t(labelKey)}</SelectGroupLabel>
                    {sections[id].map((other) => (
                      <SelectItem key={other.id} value={other.id}>
                        {other.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null,
              )}
            </SelectContent>
          </Select>
          {others.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("tasks:releases.moveUnfinished.noTargets")}
            </p>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {unfinished > 0
            ? t("tasks:releases.moveUnfinished.summary", { count: unfinished })
            : t("tasks:releases.moveUnfinished.none")}
        </p>
      </div>
    </ConfirmDialog>
  );
}
