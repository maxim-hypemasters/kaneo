import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { archiveFeature } from "@/fetchers/task/feature-library";
import { toast } from "@/lib/toast";

type FeatureToArchive = { id: string; title: string; projectId: string };

export function ArchiveFeatureDialog({
  feature,
  onOpenChange,
}: {
  feature: FeatureToArchive | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const archive = useMutation({
    mutationFn: (target: FeatureToArchive) => archiveFeature(target.id, true),
    onSuccess: (_, target) => {
      for (const queryKey of [
        ["task", target.id],
        ["project-features", target.projectId],
        ["feature-library", target.projectId],
        ["activities", target.id],
      ])
        void cache.invalidateQueries({ queryKey });
      onOpenChange(false);
    },
    onError: () => toast.error(t("tasks:features.library.saveError")),
  });

  return (
    <ConfirmDialog
      open={feature !== null}
      onOpenChange={(open) => {
        if (!archive.isPending) onOpenChange(open);
      }}
      title={t("tasks:features.library.archiveDialogTitle", {
        title: feature?.title ?? "",
      })}
      description={t("tasks:features.library.archiveDialogDescription")}
      confirmLabel={t("tasks:features.library.archive")}
      pendingLabel={t("tasks:features.library.archiving")}
      pending={archive.isPending}
      destructive={false}
      confirmDisabled={!feature}
      onConfirm={() => {
        if (feature && !archive.isPending) archive.mutate(feature);
      }}
    />
  );
}
