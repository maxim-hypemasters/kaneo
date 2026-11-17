import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { TimeOffPage } from "@/components/time-off/time-off-page";
import { isMonthParam } from "@/lib/time-off/time-off-month";
import { isTimeOffView, type TimeOffView } from "@/lib/time-off/time-off-view";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/time-off",
)({
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: TimeOffView; month?: string } => ({
    view: isTimeOffView(search.view) ? search.view : undefined,
    month: isMonthParam(search.month) ? search.month : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { view, month } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <>
      <PageTitle title={t("team:timeOff.pageTitle")} />
      <TimeOffPage
        workspaceId={workspaceId}
        view={view}
        month={month}
        onViewChange={(nextView) =>
          void navigate({ search: { view: nextView, month } })
        }
        onMonthChange={(nextMonth) =>
          void navigate({ search: { view, month: nextMonth } })
        }
      />
    </>
  );
}
