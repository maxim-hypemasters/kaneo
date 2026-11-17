import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/components/project/error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MemberHolidays } from "@/fetchers/time-off/types";
import { useSetHolidayCalendar } from "@/hooks/mutations/time-off/use-set-holiday-calendar";
import { useHolidayCountries } from "@/hooks/queries/time-off/use-holiday-countries";
import { useHolidayRegions } from "@/hooks/queries/time-off/use-holiday-regions";
import { timeOffErrorKey } from "@/lib/time-off/time-off-error-key";
import { toast } from "@/lib/toast";
import { useTimeOffFormatLocale } from "../use-time-off-format-locale";
import { HolidayOptionCombobox } from "./holiday-option-combobox";
import { sameHolidayCalendar } from "./same-holiday-calendar";

type HolidayCalendarFormProps = {
  workspaceId: string;
  // Omit for your own calendar.
  userId?: string;
  holidays: Pick<
    MemberHolidays,
    "calendar" | "calendarChosen" | "pendingRequest" | "nextChangeNeedsApproval"
  >;
  onDone: () => void;
};

// Picks a country and optional region, or No calendar. With a change waiting
// for approval it starts from that change: leaving it as it is keeps the
// request while changes need approval, and applies it once they don't;
// picking the current calendar again withdraws it.
export function HolidayCalendarForm({
  workspaceId,
  userId,
  holidays,
  onDone,
}: HolidayCalendarFormProps) {
  const { t } = useTranslation();
  const lang = useTimeOffFormatLocale();
  const countryId = useId();
  const regionId = useId();
  const noteId = useId();
  const countryRef = useRef<HTMLInputElement>(null);
  const { calendar, calendarChosen, pendingRequest, nextChangeNeedsApproval } =
    holidays;
  const start = pendingRequest ? pendingRequest.calendar : calendar;
  const [country, setCountry] = useState(start?.country ?? null);
  const [region, setRegion] = useState(start?.region ?? null);
  const countries = useHolidayCountries(workspaceId, { lang });
  const regions = useHolidayRegions(workspaceId, country, { lang });
  const save = useSetHolidayCalendar(workspaceId, lang);
  const target = { country, region };
  // Sending the calendar in effect changes nothing, so it never waits.
  const keepsCurrent = calendarChosen && sameHolidayCalendar(target, calendar);
  const willRequest = nextChangeNeedsApproval && !keepsCurrent;

  // The starting choice shows by name before the lists load.
  const countryOptions =
    countries.data ??
    (start ? [{ code: start.country, name: start.countryName }] : []);
  const regionOptions =
    regions.data ??
    (start?.region && start.country === country
      ? [{ code: start.region, name: start.regionName ?? start.region }]
      : []);
  const status = (query: { isPending: boolean; isError: boolean }) =>
    query.isError
      ? t("team:timeOff.holidays.optionsError")
      : query.isPending
        ? t("team:timeOff.holidays.loadingOptions")
        : null;

  useEffect(() => {
    countryRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    // Close without sending only when the server would keep things as they
    // are. Without a choice yet, even No calendar is one to record, and a
    // waiting change applies once changes no longer need approval.
    if (
      sameHolidayCalendar(target, start) &&
      (pendingRequest ? nextChangeNeedsApproval : calendarChosen)
    ) {
      onDone();
      return;
    }
    const withdraws = pendingRequest !== null && keepsCurrent;
    try {
      const result = await save.mutateAsync({ userId, country, region });
      toast.success(
        t(
          result.status === "pending"
            ? "team:timeOff.holidays.requestSent"
            : withdraws
              ? "team:timeOff.holidays.withdrawn"
              : country
                ? "team:timeOff.holidays.saved"
                : "team:timeOff.holidays.cleared",
        ),
      );
      onDone();
    } catch (error) {
      const key = timeOffErrorKey(error);
      toast.error(
        key
          ? t(key)
          : errorMessage(error, t("team:timeOff.holidays.saveError")),
      );
    }
  };

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor={countryId}>
          {t("team:timeOff.holidays.countryLabel")}
        </Label>
        <HolidayOptionCombobox
          id={countryId}
          inputRef={countryRef}
          options={countryOptions}
          noneLabel={t("team:timeOff.holidays.noCalendar")}
          value={country}
          placeholder={t("team:timeOff.holidays.searchCountry")}
          emptyText={t("team:timeOff.holidays.noCountryResults")}
          status={status(countries)}
          disabled={save.isPending}
          onChange={(next) => {
            setCountry(next);
            setRegion(null);
          }}
        />
      </div>
      {country && regionOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={regionId}>
            {t("team:timeOff.holidays.regionLabel")}
          </Label>
          <HolidayOptionCombobox
            id={regionId}
            options={regionOptions}
            noneLabel={t("team:timeOff.holidays.wholeCountry")}
            value={region}
            placeholder={t("team:timeOff.holidays.searchRegion")}
            emptyText={t("team:timeOff.holidays.noRegionResults")}
            status={status(regions)}
            disabled={save.isPending}
            onChange={setRegion}
          />
        </div>
      ) : null}
      {nextChangeNeedsApproval ? (
        <p id={noteId} className="text-muted-foreground text-xs">
          {t("team:timeOff.holidays.approvalNote")}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={save.isPending}
          onClick={onDone}
        >
          {t("common:actions.cancel")}
        </Button>
        <Button
          type="submit"
          size="sm"
          loading={save.isPending}
          aria-describedby={nextChangeNeedsApproval ? noteId : undefined}
        >
          {t(
            willRequest
              ? "team:timeOff.holidays.sendForApproval"
              : "team:timeOff.holidays.save",
          )}
        </Button>
      </div>
    </form>
  );
}
