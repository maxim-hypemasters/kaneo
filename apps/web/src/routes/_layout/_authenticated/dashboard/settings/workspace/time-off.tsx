import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { TimeOffSettings } from "@/components/settings/time-off/time-off-settings";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/time-off",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:workspaceTimeOff.pageTitle")} />
      <TimeOffSettings />
    </>
  );
}
