import { Layers } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { MilestoneDialog } from "@/components/task/milestones/milestone-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetProjectFeatures } from "@/hooks/queries/task/use-get-project-features";
import { HttpError } from "@/lib/http-error";

export function CreateMasterplanningMilestoneDialog({
  projectId,
  initialReleaseId,
  onClose,
}: {
  projectId: string;
  initialReleaseId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const featuresQuery = useGetProjectFeatures(projectId);
  const [releaseId] = useState(initialReleaseId);
  const [query, setQuery] = useState("");
  const [feature, setFeature] = useState<{ id: string; title: string } | null>(
    null,
  );
  const handingOffFocus = useRef(false);
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const accessDenied =
    featuresQuery.isError &&
    featuresQuery.error instanceof HttpError &&
    (featuresQuery.error.status === 401 || featuresQuery.error.status === 403);
  // Feature pickers offer active knowledge records; archived Features stay
  // readable for existing references but cannot receive new work here.
  const features = (accessDenied ? [] : (featuresQuery.data ?? [])).filter(
    (item) => !item.archivedAt && item.status !== "archived",
  );
  const hasMatches = features.some((item) =>
    item.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  if (feature) {
    return (
      <MilestoneDialog
        projectId={projectId}
        featureId={feature.id}
        featureName={feature.title}
        initialReleaseId={releaseId}
        finalFocus={returnFocus}
        onClose={onClose}
      />
    );
  }

  const loadError = (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p>{t("common:modals.createTask.loadFeaturesError")}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={featuresQuery.isFetching}
        onClick={() => void featuresQuery.refetch()}
      >
        {t("common:error.tryAgain")}
      </Button>
    </div>
  );
  const status = featuresQuery.isPending ? (
    <p role="status">{t("common:modals.createTask.loadingFeatures")}</p>
  ) : featuresQuery.isError && (!featuresQuery.data || accessDenied) ? (
    loadError
  ) : features.length === 0 ? (
    <p role="status">{t("tasks:releases.masterplanning.noFeatures")}</p>
  ) : !hasMatches ? (
    <p role="status">{t("common:modals.createTask.noFeaturesFound")}</p>
  ) : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup
        finalFocus={() =>
          handingOffFocus.current ? false : returnFocus.current
        }
      >
        <DialogHeader>
          <DialogTitle>{t("tasks:milestones.add")}</DialogTitle>
          <DialogDescription>
            {t("tasks:releases.masterplanning.chooseFeature")}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="overflow-hidden rounded-lg border">
            <OptionMenu
              label={t("tasks:features.property")}
              placeholder={t("common:modals.createTask.searchFeatures")}
              options={features.map((item) => ({
                value: item.id,
                label: item.title,
                icon: (
                  <Layers
                    aria-hidden="true"
                    className="text-muted-foreground"
                  />
                ),
              }))}
              numberShortcuts={false}
              onQueryChange={setQuery}
              status={status}
              onSelect={(id) => {
                const selected = features.find((item) => item.id === id);
                if (!selected) return;
                handingOffFocus.current = true;
                setFeature({ id: selected.id, title: selected.title });
              }}
            />
          </div>
          {featuresQuery.isError && featuresQuery.data && !accessDenied && (
            <div className="mt-3 text-sm">{loadError}</div>
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
