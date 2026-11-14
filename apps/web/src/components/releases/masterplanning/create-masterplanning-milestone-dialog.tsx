import { Layers, Plus } from "lucide-react";
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
import useCreateTask from "@/hooks/mutations/task/use-create-task";
import { useGetProjectFeatures } from "@/hooks/queries/task/use-get-project-features";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";

const CREATE_FEATURE = ":create";

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
  const createFeature = useCreateTask();
  const { canWorkItem } = useWorkspacePermission();
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
  const name = query.trim();
  const needle = name.toLowerCase();
  const hasMatches = features.some((item) =>
    item.title.toLowerCase().includes(needle),
  );
  const canCreate =
    Boolean(featuresQuery.data) &&
    !accessDenied &&
    canWorkItem("feature", "create");
  // Offered for a typed name no active Feature already has.
  const offerCreate =
    canCreate &&
    name !== "" &&
    !features.some((item) => item.title.toLowerCase() === needle);

  const handOff = (selected: { id: string; title: string }) => {
    handingOffFocus.current = true;
    setFeature({ id: selected.id, title: selected.title });
  };

  // Created at once, so the milestone form can belong to it.
  const create = () => {
    if (createFeature.isPending) return;
    createFeature.mutate(
      { title: name, description: "", projectId, type: "feature" },
      {
        onSuccess: (created) => handOff(created),
        onError: () =>
          toast.error(t("common:modals.createTask.createFeatureError")),
      },
    );
  };

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
  ) : createFeature.isPending ? (
    <p role="status">{t("tasks:releases.masterplanning.creatingFeature")}</p>
  ) : offerCreate ? undefined : features.length === 0 ? (
    <p role="status">
      {t(
        canCreate
          ? "tasks:releases.masterplanning.noFeaturesCreate"
          : "tasks:releases.masterplanning.noFeatures",
      )}
    </p>
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
            {t(
              canCreate
                ? "tasks:releases.masterplanning.chooseOrCreateFeature"
                : "tasks:releases.masterplanning.chooseFeature",
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="overflow-hidden rounded-lg border">
            <OptionMenu
              label={t("tasks:features.property")}
              placeholder={t("common:modals.createTask.searchFeatures")}
              options={[
                ...features.map((item) => ({
                  value: item.id,
                  label: item.title,
                  icon: (
                    <Layers
                      aria-hidden="true"
                      className="text-muted-foreground"
                    />
                  ),
                })),
                ...(offerCreate
                  ? [
                      {
                        value: CREATE_FEATURE,
                        label: t("common:modals.createTask.createFeature", {
                          name,
                        }),
                        icon: (
                          <Plus
                            aria-hidden="true"
                            className="text-muted-foreground"
                          />
                        ),
                        pinned: true,
                      },
                    ]
                  : []),
              ]}
              numberShortcuts={false}
              onQueryChange={setQuery}
              status={status}
              onSelect={(id) => {
                if (id === CREATE_FEATURE) return create();
                const selected = features.find((item) => item.id === id);
                if (selected) handOff(selected);
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
