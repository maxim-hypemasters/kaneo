import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogTrigger } from "@/components/ui/dialog";
import type { Release } from "@/types/release";
import type {
  ReleasePlanChanges,
  ReleasePlanPreview,
} from "@/types/release-plan";

import { AdjustReleaseDatesForm } from "./adjust-release-dates-form";

export function AdjustReleaseDatesDialog({
  release,
  preview,
  changes,
  disabled,
  onChange,
}: {
  release: Release;
  preview: ReleasePlanPreview;
  changes: ReleasePlanChanges;
  disabled: boolean;
  onChange: (changes: ReleasePlanChanges) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next || !disabled) setOpen(next);
      }}
    >
      <DialogTrigger
        disabled={disabled}
        render={<Button type="button" variant="outline" size="xs" />}
      >
        {t("tasks:releases.planning.resolution.adjustDates")}
      </DialogTrigger>
      <DialogPopup className="max-w-lg">
        {open && (
          <AdjustReleaseDatesForm
            release={release}
            preview={preview}
            changes={changes}
            disabled={disabled}
            onSubmit={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}
