import { Link } from "@tanstack/react-router";
import { Inbox, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function TriageEmptyState({
  projectId,
  triageEnabled,
  canManage,
}: {
  projectId: string;
  triageEnabled: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const state = triageEnabled ? "empty" : "off";

  return (
    <Empty className="min-h-[50vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">
          {t(`tasks:triage.${state}.title`)}
        </EmptyTitle>
        <EmptyDescription>
          {t(`tasks:triage.${state}.description`)}
        </EmptyDescription>
      </EmptyHeader>
      {!triageEnabled && canManage ? (
        <EmptyContent>
          <Button
            variant="outline"
            render={
              <Link
                to="/dashboard/settings/projects/$projectId/triage"
                params={{ projectId }}
              />
            }
          >
            <Settings aria-hidden="true" />
            {t("tasks:triage.off.action")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
