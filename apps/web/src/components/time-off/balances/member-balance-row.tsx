import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/components/project/error-message";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { TimeOffBalance, TimeOffType } from "@/fetchers/time-off/types";
import { useClearTimeOffAllowanceOverride } from "@/hooks/mutations/time-off/use-clear-time-off-allowance-override";
import { useSetTimeOffAllowanceOverride } from "@/hooks/mutations/time-off/use-set-time-off-allowance-override";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type { TimelineMember } from "../timeline/timeline-members";
import { TIME_OFF_TYPE_STYLES } from "../time-off-type-styles";
import { AllowanceDaysInput } from "./allowance-days-input";

type MemberBalanceRowProps = {
  workspaceId: string;
  balance: TimeOffBalance;
  // The type whose allowance and days the row shows.
  type: TimeOffType;
  member: TimelineMember;
  isViewer: boolean;
  defaultAllowanceDays: number;
};

// An empty allowance field means the member follows the workspace default
// for the type.
export function MemberBalanceRow({
  workspaceId,
  balance,
  type,
  member,
  isViewer,
  defaultAllowanceDays,
}: MemberBalanceRowProps) {
  const { t } = useTranslation();
  const setOverride = useSetTimeOffAllowanceOverride(workspaceId);
  const clearOverride = useClearTimeOffAllowanceOverride(workspaceId);
  const inputRef = useRef<HTMLInputElement>(null);
  const name = member.name || t("common:people.unknown");
  const typeLabel = t(TIME_OFF_TYPE_STYLES[type].labelKey);
  const figures = balance.types[type];
  const hasOverride = figures.allowanceSource === "override";
  const over = figures.remainingDays < 0;
  const days = (count: number) => t("team:timeOff.days", { count });

  // Resolves whether the change saved.
  const save = async (allowance: number | null) => {
    try {
      if (allowance === null) {
        await clearOverride.mutateAsync({ userId: balance.userId, type });
        toast.success(
          t("team:timeOff.balances.overrideCleared", {
            type: typeLabel,
            name,
          }),
        );
      } else {
        await setOverride.mutateAsync({
          userId: balance.userId,
          type,
          days: allowance,
        });
        toast.success(
          t("team:timeOff.balances.overrideSaved", { type: typeLabel, name }),
        );
      }
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t("team:timeOff.balances.saveError")));
      return false;
    }
  };

  // The button goes once the override is cleared; the field takes focus.
  const restoreDefault = async () => {
    if (await save(null)) inputRef.current?.focus();
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2">
          <AssigneeAvatar
            assigned
            name={member.name}
            image={member.image}
            className="size-6"
          />
          <span className="max-w-48 truncate font-medium" title={name}>
            {name}
          </span>
          {isViewer ? (
            <span className="shrink-0 text-muted-foreground text-xs">
              {t("team:timeOff.you")}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-start gap-1">
          <AllowanceDaysInput
            ref={inputRef}
            value={hasOverride ? figures.allowanceDays : null}
            placeholder={t("team:timeOff.balances.defaultPlaceholder", {
              count: defaultAllowanceDays,
            })}
            allowEmpty
            className="w-28"
            aria-label={t("team:timeOff.balances.overrideLabel", {
              type: typeLabel,
              name,
            })}
            onCommit={async (days) => {
              await save(days);
            }}
          />
          {hasOverride ? (
            <Button
              variant="ghost"
              size="sm"
              loading={clearOverride.isPending}
              disabled={setOverride.isPending}
              aria-label={t("team:timeOff.balances.useDefaultFor", {
                type: typeLabel,
                name,
              })}
              onClick={() => void restoreDefault()}
            >
              {t("team:timeOff.balances.useDefault")}
            </Button>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {days(figures.usedDays)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {days(figures.pendingDays)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right tabular-nums",
          over && "font-medium text-destructive-foreground",
        )}
      >
        {over
          ? t("team:timeOff.balance.over", { count: -figures.remainingDays })
          : days(figures.remainingDays)}
      </TableCell>
    </TableRow>
  );
}
