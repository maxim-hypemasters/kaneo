import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { resolveOriginRelease } from "../task-release-origin";
import { useTaskReleaseOrigin } from "../task-release-origin-context";
import { MilestoneDialog } from "./milestone-dialog";

export function CreateFeatureMilestoneDialog({
  projectId,
  featureId,
  onClose,
}: {
  projectId: string;
  featureId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const origin = useTaskReleaseOrigin();
  const [originReleaseId] = useState(
    origin?.projectId === projectId ? origin.releaseId : undefined,
  );
  const releases = useGetReleases(projectId, {
    enabled: Boolean(originReleaseId),
    refetchOnMount: "always",
  });
  const [resolved, setResolved] = useState<{ releaseId: string | null } | null>(
    originReleaseId ? null : { releaseId: null },
  );
  const handingOffFocus = useRef(false);
  useEffect(() => {
    if (
      !resolved &&
      !releases.isFetching &&
      !releases.isPending &&
      !releases.isError &&
      releases.data !== undefined
    ) {
      handingOffFocus.current = true;
      setResolved({
        releaseId: resolveOriginRelease(
          originReleaseId,
          projectId,
          releases.data,
        ),
      });
    }
  }, [
    resolved,
    releases.isFetching,
    releases.isPending,
    releases.isError,
    releases.data,
    originReleaseId,
    projectId,
  ]);

  if (resolved) {
    return (
      <MilestoneDialog
        projectId={projectId}
        featureId={featureId}
        initialReleaseId={resolved.releaseId}
        onClose={onClose}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup
        // The replacement form owns focus after resolution; restoring the old
        // popup's trigger here would override the title input's autofocus.
        finalFocus={() => !handingOffFocus.current}
      >
        <DialogHeader>
          <DialogTitle>{t("tasks:milestones.add")}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          {releases.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p>{t("tasks:milestones.releaseContextError")}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void releases.refetch()}
              >
                {t("common:error.tryAgain")}
              </Button>
            </div>
          ) : (
            <p role="status">{t("common:empty.loading")}</p>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common:actions.cancel")}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
