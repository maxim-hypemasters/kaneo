import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { timelineMembers } from "../timeline/timeline-members";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { SELF } from "./time-off-form-values";

type TimeOffMemberFieldProps = {
  workspaceId: string;
  viewerId?: string;
  // SELF, another member's user id, or null until chosen.
  value: string | null;
  // Approvers without time_off:create can only record for others.
  canRequestForSelf: boolean;
  error?: string;
  disabled?: boolean;
  onChange: (member: string) => void;
};

// Approvers record time off for anyone; it still starts pending.
export function TimeOffMemberField({
  workspaceId,
  viewerId,
  value,
  canRequestForSelf,
  error,
  disabled = false,
  onChange,
}: TimeOffMemberFieldProps) {
  const { t } = useTranslation();
  const locale = useTimeOffFormatLocale();
  const triggerId = useId();
  const errorId = useId();
  const users = useGetActiveWorkspaceUsers(workspaceId);
  const options = useMemo(
    () => [
      ...(canRequestForSelf
        ? [{ value: SELF, label: t("team:timeOff.dialog.me") }]
        : []),
      ...timelineMembers(users.data?.members ?? [], viewerId, locale)
        .filter((member) => member.userId !== viewerId)
        .map((member) => ({
          value: member.userId,
          label: member.name || t("common:people.unknown"),
        })),
    ],
    [canRequestForSelf, users.data, viewerId, locale, t],
  );
  const selected = options.find((option) => option.value === value);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={triggerId}>{t("team:timeOff.dialog.memberLabel")}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string" && next) onChange(next);
        }}
      >
        <SelectTrigger
          id={triggerId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <SelectValue placeholder={t("team:timeOff.dialog.memberPlaceholder")}>
            {selected?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={errorId} className="text-destructive-foreground text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
