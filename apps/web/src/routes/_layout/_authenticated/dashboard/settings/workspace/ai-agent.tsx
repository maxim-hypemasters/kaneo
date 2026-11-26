import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { RunnerSettings } from "@/components/settings/ai-agent/runner-settings";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/ai-agent",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:aiAgentPage.pageTitle")} />
      <RunnerSettings />
    </>
  );
}
