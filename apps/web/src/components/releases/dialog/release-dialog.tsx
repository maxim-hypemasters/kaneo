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
  const today = useReleaseToday();
  const { data: releases = [], isPending } = useGetReleases(projectId, {
    enabled: open,
  });
  // A new release's suggested dates come from the others, so its form waits
  // for them; a failed load leaves the dates to pick.
  const waiting = release === null && isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        className="sm:max-w-lg"
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
            key={release?.id ?? "new"}
            projectId={projectId}
            release={release}
            releases={releases}
            today={today}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}
