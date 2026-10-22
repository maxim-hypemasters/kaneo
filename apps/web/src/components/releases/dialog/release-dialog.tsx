import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type { Release } from "@/types/release";
import { ReleaseForm } from "./release-form";

type ReleaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  // null creates a release.
  release: Release | null;
  onCreated?: (release: Omit<Release, "progress">) => void;
};

export function ReleaseDialog({
  open,
  onOpenChange,
  projectId,
  release,
  onCreated,
}: ReleaseDialogProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const today = useReleaseToday();
  const { data: releases = [], isPending } = useGetReleases(projectId, {
    enabled: open,
  });
  // Snapshot defaults after the project's releases load. A failed initial
  // load leaves the name and dates for the user to choose.
  const waiting = release === null && isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && creating) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup
        className="sm:max-w-lg"
        showCloseButton={!creating}
        aria-label={
          waiting ? t("tasks:releases.dialog.createTitle") : undefined
        }
      >
        {waiting ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="text-muted-foreground" />
          </div>
        ) : (
          <ReleaseForm
            key={`${projectId}:${release?.id ?? "new"}`}
            projectId={projectId}
            release={release}
            releases={releases}
            today={today}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
            onCreatingChange={setCreating}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}
