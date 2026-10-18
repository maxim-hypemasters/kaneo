import { Link } from "@tanstack/react-router";
import { ArrowLeft, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function ReleaseNotFound({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const { t } = useTranslation();

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rocket aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">
          {t("tasks:releases.detail.notFound")}
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          render={
            <Link
              to="/dashboard/workspace/$workspaceId/project/$projectId/releases"
              params={{ workspaceId, projectId }}
            />
          }
        >
          <ArrowLeft aria-hidden="true" />
          {t("tasks:releases.detail.backToReleases")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
