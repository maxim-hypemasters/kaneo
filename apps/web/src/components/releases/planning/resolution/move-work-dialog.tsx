import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogTrigger } from "@/components/ui/dialog";
import type { Release } from "@/types/release";
import type {
  ReleasePlanChanges,
  ReleasePlanPreview,
} from "@/types/release-plan";
import { MoveWorkForm } from "./move-work-form";
import type { MoveSelection } from "./resolution-model";

export function MoveWorkDialog(props: {
  selection: MoveSelection;
  preview: ReleasePlanPreview;
  release: Release;
  releases: Release[];
  changes: ReleasePlanChanges;
  disabled: boolean;
  onChange: (changes: ReleasePlanChanges) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { selection } = props;
  const label =
    selection.kind === "task"
      ? t("tasks:releases.planning.resolution.moveNext")
      : selection.kind === "late"
        ? t("tasks:releases.planning.resolution.moveAllLate")
        : selection.moveMilestone
          ? t("tasks:releases.planning.resolution.moveMilestone")
          : t("tasks:releases.planning.resolution.moveMilestoneWork");
  const title =
    selection.kind === "task"
      ? t("tasks:releases.planning.resolution.moveTask", {
          title: selection.task.title,
        })
      : selection.kind === "milestone"
        ? t(
            selection.moveMilestone
              ? "tasks:releases.planning.resolution.moveMilestoneNamed"
              : "tasks:releases.planning.resolution.moveMilestoneWorkNamed",
            { title: selection.title },
          )
        : label;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next || !props.disabled) setOpen(next);
      }}
    >
      <DialogTrigger
        disabled={props.disabled}
        aria-label={title}
        render={<Button type="button" variant="outline" size="xs" />}
      >
        {label}
      </DialogTrigger>
      <DialogPopup className="max-w-xl">
        {open && (
          <MoveWorkForm
            {...props}
            title={selection.kind === "task" ? label : title}
            onSubmit={(next) => {
              props.onChange(next);
              setOpen(false);
            }}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}
