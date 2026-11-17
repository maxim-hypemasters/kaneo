import { TreePalm } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import { toMonthParam } from "@/lib/time-off/time-off-month";
import {
  availableTimeOffViews,
  isTimeOffView,
  resolveTimeOffView,
  type TimeOffView,
} from "@/lib/time-off/time-off-view";
import { TimeOffApprovalsPanel } from "./approvals/time-off-approvals-panel";
import { TimeOffApprovalsTabLabel } from "./approvals/time-off-approvals-tab-label";
import { TimeOffBalancesPanel } from "./balances/time-off-balances-panel";
import { TimeOffRequestDialog } from "./dialog/time-off-request-dialog";
import { CancelTimeOffDialog } from "./requests/cancel-time-off-dialog";
import { MyTimeOffPanel } from "./requests/my-time-off-panel";
import { TimeOffTeamPanel } from "./timeline/time-off-team-panel";
import { TimeOffTimelineSkeleton } from "./timeline/time-off-timeline-skeleton";
import { TimeOffNoAccess } from "./time-off-no-access";
import { TIME_OFF_VIEW_LABEL_KEYS } from "./time-off-view-labels";
import { useTimeOffPermissions } from "./use-time-off-permissions";

type TimeOffPageProps = {
  workspaceId: string;
  // From the URL; an unavailable view falls back to the first one allowed.
  view?: TimeOffView;
  // YYYY-MM from the URL; defaults to the current month.
  month?: string;
  onViewChange: (view: TimeOffView) => void;
  onMonthChange: (month: string) => void;
};

export function TimeOffPage({
  workspaceId,
  view,
  month,
  onViewChange,
  onMonthChange,
}: TimeOffPageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const viewerId = user?.id;
  const today = useReleaseToday();
  const permissions = useTimeOffPermissions();
  const available = availableTimeOffViews(permissions);
  const activeView = resolveTimeOffView(view, available);
  const activeMonth = month ?? toMonthParam(today);
  const canCreate = permissions.canRequest || permissions.canApprove;
  // Each dialog keeps its request after closing, for the exit animation.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TimeOffRequest | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState<TimeOffRequest | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (request: TimeOffRequest) => {
    setEditing(request);
    setFormOpen(true);
  };
  const openCancel = (request: TimeOffRequest) => {
    setCancelling(request);
    setCancelOpen(true);
  };

  let content = <TimeOffTimelineSkeleton />;
  if (!permissions.isChecking && !activeView) {
    content = <TimeOffNoAccess />;
  } else if (!permissions.isChecking && activeView) {
    content = (
      <Tabs
        value={activeView}
        onValueChange={(value) => {
          if (isTimeOffView(value)) onViewChange(value);
        }}
        className="flex h-full min-h-0 flex-col gap-0"
      >
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b px-3 py-2">
          <TabsList aria-label={t("team:timeOff.views.label")}>
            {available.map((option) => (
              <TabsTab
                key={option}
                value={option}
                className="h-7 px-2 text-xs sm:h-7 sm:text-xs"
              >
                {option === "approvals" ? (
                  <TimeOffApprovalsTabLabel
                    workspaceId={workspaceId}
                    enabled={permissions.canApprove}
                  />
                ) : (
                  t(TIME_OFF_VIEW_LABEL_KEYS[option])
                )}
              </TabsTab>
            ))}
          </TabsList>
        </div>
        {available.includes("team") ? (
          <TabsPanel value="team" className="min-h-0">
            {activeView === "team" ? (
              <TimeOffTeamPanel
                workspaceId={workspaceId}
                month={activeMonth}
                today={today}
                viewerId={viewerId}
                onMonthChange={onMonthChange}
                onEdit={openEdit}
                onCancel={openCancel}
              />
            ) : null}
          </TabsPanel>
        ) : null}
        <TabsPanel value="mine" className="min-h-0">
          {activeView === "mine" ? (
            <MyTimeOffPanel
              workspaceId={workspaceId}
              month={activeMonth}
              today={today}
              onMonthChange={onMonthChange}
              onEdit={openEdit}
              onCancel={openCancel}
              onRequest={canCreate ? openCreate : undefined}
              canEditHolidayCalendar={permissions.canRequest}
              canApprove={permissions.canApprove}
            />
          ) : null}
        </TabsPanel>
        {permissions.canApprove ? (
          <>
            <TabsPanel value="approvals" className="min-h-0">
              {activeView === "approvals" ? (
                <TimeOffApprovalsPanel
                  workspaceId={workspaceId}
                  today={today}
                />
              ) : null}
            </TabsPanel>
            <TabsPanel value="balances" className="min-h-0">
              {activeView === "balances" ? (
                <TimeOffBalancesPanel
                  workspaceId={workspaceId}
                  month={activeMonth}
                  onMonthChange={onMonthChange}
                />
              ) : null}
            </TabsPanel>
          </>
        ) : null}
      </Tabs>
    );
  }

  return (
    <WorkspaceLayout
      title={t("team:timeOff.pageTitle")}
      headerActions={
        canCreate ? (
          <Button
            variant="outline"
            size="xs"
            onClick={openCreate}
            className="gap-1"
          >
            <TreePalm aria-hidden="true" className="size-3" />
            {t("team:timeOff.request")}
          </Button>
        ) : null
      }
    >
      {content}
      <TimeOffRequestDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        workspaceId={workspaceId}
        request={editing}
        viewerId={viewerId}
        canRequest={permissions.canRequest}
        canApprove={permissions.canApprove}
        today={today}
      />
      <CancelTimeOffDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        workspaceId={workspaceId}
        request={cancelling}
        today={today}
      />
    </WorkspaceLayout>
  );
}
