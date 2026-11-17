import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { AssistantSettings } from "@/components/settings/assistant/assistant-settings";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/assistant",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:assistantPage.pageTitle")} />
      <AssistantSettings />
    </>
  );
}
