import { Link } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { useTimeOffBalances } from "@/hooks/queries/time-off/use-time-off-balances";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { cn } from "@/lib/cn";
import { monthYear, shiftMonth } from "@/lib/time-off/time-off-month";
import { TimeOffRequestsSkeleton } from "../requests/time-off-requests-skeleton";
import { timelineMembers } from "../timeline/timeline-members";
import { TimeOffLoadError } from "../time-off-load-error";
import { TimeOffYearNav } from "../time-off-year-nav";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { balanceRows } from "./balance-rows";
import { MemberBalanceRow } from "./member-balance-row";
import { TimeOffTypeToggle } from "./time-off-type-toggle";

type TimeOffBalancesPanelProps = {
  workspaceId: string;
  // YYYY-MM; the panel shows its Jan-Dec year.
  month: string;
  onMonthChange: (month: string) => void;
};

// Approvers only: member overrides and everyone's used, pending and remaining
// days of one type for a year. The defaults live in workspace settings.
export function TimeOffBalancesPanel({
  workspaceId,
  month,
  onMonthChange,
}: TimeOffBalancesPanelProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const viewerId = user?.id;
  const locale = useTimeOffFormatLocale();
  const headingId = useId();
  const hintId = useId();
  const [type, setType] = useState<TimeOffType>("vacation");
  const year = monthYear(month);
  const balances = useTimeOffBalances(workspaceId, year);
  const users = useGetActiveWorkspaceUsers(workspaceId);
  const rows = useMemo(
    () =>
      balanceRows(
        balances.data?.members ?? [],
        timelineMembers(users.data?.members ?? [], viewerId, locale),
      ),
    [balances.data, users.data, viewerId, locale],
  );

  let content = <TimeOffRequestsSkeleton />;
  if (balances.data && users.data) {
    // Allowances apply to every year; only the day counts belong to `year`,
    // so the table dims while another year loads.
    const busy = balances.isPlaceholderData;
    content = (
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 id={headingId} className="font-medium text-sm">
              {t("team:timeOff.balances.title", { year })}
            </h2>
            <p id={hintId} className="text-muted-foreground text-xs">
              {t("team:timeOff.balances.hint")}
              {type === "public_holiday"
                ? ` ${t("team:timeOff.balances.publicHolidayHint")}`
                : null}
            </p>
            <p className="text-muted-foreground text-xs">
              <Trans
                i18nKey="team:timeOff.balances.defaultsInSettings"
                components={{
                  link: (
                    <Link
                      to="/dashboard/settings/workspace/time-off"
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    />
                  ),
                }}
              />
            </p>
          </div>
          <TimeOffTypeToggle value={type} onChange={setType} />
        </div>
        <div
          aria-busy={busy || undefined}
          className={cn(
            "rounded-xl border bg-card transition-opacity",
            busy && "opacity-60",
          )}
        >
          <Table aria-labelledby={headingId} aria-describedby={hintId}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("team:timeOff.balances.member")}</TableHead>
                <TableHead>{t("team:timeOff.balances.allowance")}</TableHead>
                <TableHead className="text-right">
                  {t("team:timeOff.balance.used")}
                </TableHead>
                <TableHead className="text-right">
                  {t("team:timeOff.balance.pending")}
                </TableHead>
                <TableHead className="text-right">
                  {t("team:timeOff.balance.remaining")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ balance, member }) => (
                <MemberBalanceRow
                  // The type resets a half-typed allowance.
                  key={`${balance.userId}:${type}`}
                  workspaceId={workspaceId}
                  balance={balance}
                  type={type}
                  member={member}
                  isViewer={balance.userId === viewerId}
                  defaultAllowanceDays={balances.data.defaultAllowances[type]}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    );
  } else if (balances.isError || users.isError) {
    content = (
      <TimeOffLoadError
        className="rounded-xl border"
        message={t("team:timeOff.balances.loadError")}
        retrying={balances.isFetching || users.isFetching}
        onRetry={() => {
          if (balances.isError) void balances.refetch();
          if (users.isError) void users.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <TimeOffYearNav
          year={year}
          onChange={(next) =>
            onMonthChange(shiftMonth(month, (next - year) * 12))
          }
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
          {content}
        </div>
      </div>
    </div>
  );
}
