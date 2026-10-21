import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetPanel,
} from "@/components/ui/sheet";
import { getMilestone } from "@/fetchers/milestone/milestones";
import { useMilestoneDetailsStore } from "@/store/milestone-details";
import { MilestoneDetails } from "./milestone-details";
export function MilestoneDetailsSheet({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string;
}) {
  const {
    milestoneId,
    projectId: openedProject,
    close,
  } = useMilestoneDetailsStore();
  const { t } = useTranslation();
  const id = openedProject === projectId ? milestoneId : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const query = useQuery({
    queryKey: ["feature-milestones", projectId, "detail", id, timeZone],
    queryFn: () => getMilestone(id!, timeZone),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
  useEffect(
    () => () => {
      if (useMilestoneDetailsStore.getState().projectId === projectId) close();
    },
    [projectId, close],
  );
  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetPopup className="w-full max-w-2xl">
        <SheetHeader>
          <SheetTitle className="break-words pr-7">
            {query.data?.title ?? t("tasks:milestones.property")}
          </SheetTitle>
        </SheetHeader>
        <SheetPanel>
          {query.isPending ? (
            <p role="status">{t("tasks:milestones.loading")}</p>
          ) : query.isError ? (
            <div role="alert">
              <p>{t("tasks:milestones.loadError")}</p>
              <Button onClick={() => void query.refetch()}>
                {t("common:error.tryAgain")}
              </Button>
            </div>
          ) : (
            <MilestoneDetails
              key={query.data.id}
              milestone={query.data}
              projectId={projectId}
              workspaceId={workspaceId}
            />
          )}
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
