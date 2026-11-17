import { TreePalm } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { useCreateTimeOffRequest } from "@/hooks/mutations/time-off/use-create-time-off-request";
import { useUpdateTimeOffRequest } from "@/hooks/mutations/time-off/use-update-time-off-request";
import { useMemberHolidayYears } from "@/hooks/queries/time-off/use-member-holiday-years";
import { useTimeOffBalanceYears } from "@/hooks/queries/time-off/use-time-off-balance-years";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { countWorkdays } from "@/lib/time-off/count-workdays";
import { projectBalances } from "@/lib/time-off/project-balance";
import { rangeYears } from "@/lib/time-off/range-years";
import { timeOffErrorKey } from "@/lib/time-off/time-off-error-key";
import { workdaysByYear } from "@/lib/time-off/workdays-by-year";
import { toast } from "@/lib/toast";
import { TIME_OFF_TYPE_STYLES } from "../time-off-type-styles";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { TimeOffDateField } from "./time-off-date-field";
import { TimeOffDaysSummary } from "./time-off-days-summary";
import {
  SELF,
  type TimeOffFormValues,
  timeOffFormValues,
} from "./time-off-form-values";
import { TimeOffMemberField } from "./time-off-member-field";
import { createTimeOffPayload, updateTimeOffPayload } from "./time-off-payload";
import { TimeOffTypeField } from "./time-off-type-field";
import {
  type TimeOffFormErrors,
  timeOffWindow,
  validateTimeOff,
} from "./validate-time-off";

const NOTE_MAX = 500;

type TimeOffRequestFormProps = {
  workspaceId: string;
  // null creates a request.
  request: TimeOffRequest | null;
  viewerId?: string;
  canRequest: boolean;
  canApprove: boolean;
  // The viewer's local day, YYYY-MM-DD.
  today: string;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
};

export function TimeOffRequestForm({
  workspaceId,
  request,
  viewerId,
  canRequest,
  canApprove,
  today,
  onClose,
  onBusyChange,
}: TimeOffRequestFormProps) {
  const { t } = useTranslation();
  const lang = useTimeOffFormatLocale();
  const createRequest = useCreateTimeOffRequest(workspaceId);
  const updateRequest = useUpdateTimeOffRequest(workspaceId);
  const [values, setValues] = useState<TimeOffFormValues>(() =>
    timeOffFormValues(request, canRequest),
  );
  const [errors, setErrors] = useState<TimeOffFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const noteId = useId();
  const noteHintId = useId();
  const isEditing = request !== null;
  const isPending =
    submitting || createRequest.isPending || updateRequest.isPending;
  const canPickMember = !isEditing && canApprove;
  const limits = timeOffWindow(today);

  // Whose balance the preview uses; undefined reads your own.
  const target = isEditing
    ? request.userId
    : values.member === SELF
      ? viewerId
      : values.member;
  const balanceUserId = target && target !== viewerId ? target : undefined;
  const { startDate, endDate } = values;
  const range =
    startDate && endDate && startDate <= endDate
      ? { startDate, endDate }
      : null;
  // Another member's balance and holidays need time_off:approve.
  const balanceEnabled = Boolean(target) && (!balanceUserId || canApprove);
  // The member's calendar holidays are not working days.
  const holidays = useMemberHolidayYears(
    workspaceId,
    range ? rangeYears(range.startDate, range.endDate) : [],
    { userId: balanceUserId, lang, enabled: balanceEnabled },
  );
  const draft = range
    ? workdaysByYear(range.startDate, range.endDate, holidays.days)
    : [];
  const balances = useTimeOffBalanceYears(
    workspaceId,
    draft.map(({ year }) => year),
    {
      userId: balanceUserId,
      enabled: balanceEnabled,
    },
  );
  const original =
    request?.status === "pending" || request?.status === "approved"
      ? {
          type: request.type,
          status: request.status,
          daysByYear: request.daysByYear,
        }
      : undefined;
  // Until the holidays load, the draft may count one as a working day.
  const projections = holidays.isPending
    ? []
    : projectBalances(balances.balances, values.type, draft, original);

  const errorText = (field: keyof TimeOffFormErrors) => {
    const error = errors[field];
    if (!error) return undefined;
    if (!error.window) return t(error.key);
    return t(error.key, {
      start: formatReleaseDate(error.window.earliest, { today }),
      end: formatReleaseDate(error.window.latest, { today }),
    });
  };

  const update = (next: Partial<TimeOffFormValues>) => {
    setValues((current) => ({ ...current, ...next }));
    setErrors((current) => {
      const remaining = { ...current };
      for (const field of Object.keys(next)) {
        delete remaining[field as keyof TimeOffFormErrors];
      }
      // Either day can fix a range error shown on the other.
      if ("startDate" in next || "endDate" in next) {
        delete remaining.startDate;
        delete remaining.endDate;
      }
      return remaining;
    });
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || submittingRef.current) return;
    const found = validateTimeOff(values, {
      today,
      original: request ?? undefined,
      holidays: holidays.days,
    });
    if (Object.keys(found).length > 0 || !startDate || !endDate) {
      setErrors(found);
      return;
    }
    const complete = { ...values, startDate, endDate };

    submittingRef.current = true;
    setSubmitting(true);
    onBusyChange(true);
    try {
      if (request) {
        const data = updateTimeOffPayload(complete, request);
        if (data) {
          await updateRequest.mutateAsync({ id: request.id, data });
          toast.success(t("team:timeOff.dialog.updateSuccess"), {
            icon: TreePalm,
          });
        }
      } else {
        await createRequest.mutateAsync(createTimeOffPayload(complete));
        toast.success(
          t(
            values.member === SELF
              ? "team:timeOff.dialog.createSuccess"
              : "team:timeOff.dialog.recordSuccess",
          ),
          { icon: TreePalm },
        );
      }
      onClose();
    } catch (submitError) {
      const key = timeOffErrorKey(submitError);
      if (key) {
        setFormError(t(key));
        return;
      }
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : t(
              isEditing
                ? "team:timeOff.dialog.updateError"
                : "team:timeOff.dialog.createError",
            ),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onBusyChange(false);
    }
  };

  return (
    <form className="contents" noValidate onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {t(
            isEditing
              ? "team:timeOff.dialog.editTitle"
              : "team:timeOff.dialog.createTitle",
          )}
        </DialogTitle>
        <DialogDescription>
          {t(
            request?.status === "approved"
              ? "team:timeOff.dialog.descriptionApproved"
              : "team:timeOff.dialog.description",
          )}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="space-y-5">
        {canPickMember ? (
          <TimeOffMemberField
            workspaceId={workspaceId}
            viewerId={viewerId}
            value={values.member}
            canRequestForSelf={canRequest}
            error={errorText("member")}
            disabled={isPending}
            onChange={(member) => update({ member })}
          />
        ) : null}
        <TimeOffTypeField
          value={values.type}
          disabled={isPending}
          onChange={(type) => update({ type })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeOffDateField
            label={t("team:timeOff.dialog.startLabel")}
            value={startDate}
            min={limits.earliest}
            max={limits.latest}
            outOfRangeLabel={(_, date) =>
              t("team:timeOff.dialog.outsideWindow", { date })
            }
            error={errorText("startDate")}
            today={today}
            disabled={isPending}
            onChange={(day) =>
              // A later first day moves the last day along.
              update(
                !endDate || endDate < day
                  ? { startDate: day, endDate: day }
                  : { startDate: day },
              )
            }
          />
          <TimeOffDateField
            label={t("team:timeOff.dialog.endLabel")}
            value={endDate}
            min={
              startDate && startDate > limits.earliest
                ? startDate
                : limits.earliest
            }
            max={limits.latest}
            formatLimit={
              startDate
                ? (date) => t("team:timeOff.dialog.onOrAfter", { date })
                : undefined
            }
            outOfRangeLabel={(side, date) =>
              t(
                side === "before" && startDate
                  ? "team:timeOff.dialog.beforeFirstDay"
                  : "team:timeOff.dialog.outsideWindow",
                { date },
              )
            }
            error={errorText("endDate")}
            today={today}
            disabled={isPending}
            onChange={(day) => update({ endDate: day })}
          />
        </div>
        <TimeOffDaysSummary
          workdays={
            range
              ? countWorkdays(range.startDate, range.endDate, holidays.days)
              : null
          }
          typeLabel={t(TIME_OFF_TYPE_STYLES[values.type].labelKey)}
          projections={projections}
          balanceLoading={
            balanceEnabled && (balances.isPending || holidays.isPending)
          }
          balanceError={balances.isError || holidays.isError}
        />
        {formError ? (
          <p role="alert" className="text-destructive-foreground text-sm">
            {formError}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={noteId}>{t("team:timeOff.dialog.noteLabel")}</Label>
          <Textarea
            id={noteId}
            value={values.note}
            maxLength={NOTE_MAX}
            disabled={isPending}
            placeholder={t("team:timeOff.dialog.notePlaceholder")}
            aria-describedby={noteHintId}
            onChange={(event) => update({ note: event.target.value })}
          />
          <p id={noteHintId} className="text-muted-foreground text-xs">
            {t("team:timeOff.dialog.noteHint")}
          </p>
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={onClose}
        >
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" loading={isPending}>
          {t(
            isEditing
              ? "team:timeOff.dialog.save"
              : "team:timeOff.dialog.submit",
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
