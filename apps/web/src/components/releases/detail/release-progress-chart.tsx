import { useId, useMemo, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { formatReleaseDate } from "@/lib/releases/release-date";
import type { ReleaseDates } from "@/types/release";
import type { ReleaseProgressHistory } from "@/types/release-progress";
import {
  RELEASE_DATE_KIND_ORDER,
  RELEASE_DATE_KINDS,
} from "../release-date-kinds";
import {
  CHART_WIDTH,
  nearestProgressPoint,
  progressTrackingDay,
  releaseProgressGeometry,
} from "./release-progress-geometry";
import { ReleaseProgressLegend } from "./release-progress-legend";
import { ReleaseProgressPlot } from "./release-progress-plot";
import { predictedProgress } from "./release-progress-prediction";
import { ReleaseProgressTooltip } from "./release-progress-tooltip";

type ReleaseProgressChartProps = {
  release: ReleaseDates;
  history: ReleaseProgressHistory;
  timeZone: string;
};

export function ReleaseProgressChart({
  release,
  history,
  timeZone,
}: ReleaseProgressChartProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const trackingDay = progressTrackingDay(history.trackedFrom, timeZone);
  const geometry = useMemo(
    () =>
      releaseProgressGeometry(
        release,
        history.points,
        trackingDay,
        history.current.scope,
      ),
    [release, history.points, trackingDay, history.current.scope],
  );
  const lastIndex = history.points.length - 1;
  const selectedIndex = Math.min(activeIndex ?? lastIndex, lastIndex);
  const selected = history.points[selectedIndex];
  const upcoming = history.today < release.startDate;
  const empty = history.points.every((point) => point.scope === 0);
  const todayInRange =
    history.today >= release.startDate && history.today <= geometry.endDate;
  const axisDates = [
    ...new Set([
      ...RELEASE_DATE_KIND_ORDER.map(
        (kind) => release[RELEASE_DATE_KINDS[kind].field],
      ),
      ...(todayInRange ? [history.today] : []),
    ]),
  ].sort();

  const selectPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!history.points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    setActiveIndex(
      nearestProgressPoint(
        history.points,
        ((event.clientX - rect.left) / rect.width) * CHART_WIDTH,
        geometry,
      ),
    );
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in offsets) {
      event.preventDefault();
      setActiveIndex(
        Math.max(
          0,
          Math.min(
            lastIndex,
            selectedIndex + offsets[event.key as keyof typeof offsets],
          ),
        ),
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : lastIndex);
    } else if (event.key === "Escape") {
      setActiveIndex(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-center lg:gap-8">
      <div className="min-w-0">
        <div
          role="slider"
          tabIndex={selected ? 0 : -1}
          aria-label={t("tasks:releases.chart.explore")}
          aria-describedby={`${id}-instructions`}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, lastIndex)}
          aria-valuenow={Math.max(0, selectedIndex)}
          aria-valuetext={
            selected
              ? t("tasks:releases.chart.point", {
                  scope: selected.scope,
                  started: selected.started,
                  completed: selected.completed,
                  predicted: new Intl.NumberFormat(
                    i18n.resolvedLanguage || i18n.language,
                    { maximumFractionDigits: 1 },
                  ).format(
                    predictedProgress(
                      release,
                      history.current.scope,
                      selected.date,
                    ),
                  ),
                  date: formatReleaseDate(selected.date, {
                    today: history.today,
                  }),
                })
              : t("tasks:releases.chart.upcoming")
          }
          onFocus={() => {
            setFocused(true);
            setActiveIndex((index) => index ?? lastIndex);
          }}
          onBlur={() => {
            setFocused(false);
            setActiveIndex(null);
          }}
          onKeyDown={onKeyDown}
          onPointerMove={selectPointer}
          onPointerDown={selectPointer}
          onPointerLeave={(event) => {
            if (!focused && event.pointerType !== "touch") setActiveIndex(null);
          }}
          className="relative h-44 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-48"
        >
          <ReleaseProgressPlot
            release={release}
            history={history}
            geometry={geometry}
            activeIndex={activeIndex}
          />
          {todayInRange ? (
            <span
              className="pointer-events-none absolute top-0 whitespace-nowrap text-[10px] text-indigo-500"
              style={{
                left: `${(geometry.x(history.today) / CHART_WIDTH) * 100}%`,
                transform: `translateX(${geometry.x(history.today) === 0 ? 0 : geometry.x(history.today) === CHART_WIDTH ? -100 : -50}%)`,
              }}
            >
              {t("tasks:releases.detail.today")}
            </span>
          ) : null}
          {(upcoming || empty) && activeIndex === null ? (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-muted-foreground text-xs">
              {t(
                upcoming
                  ? "tasks:releases.chart.upcoming"
                  : "tasks:releases.chart.empty",
              )}
            </p>
          ) : null}
          {selected && activeIndex !== null ? (
            <ReleaseProgressTooltip
              point={selected}
              predicted={predictedProgress(
                release,
                history.current.scope,
                selected.date,
              )}
              percent={(geometry.x(selected.date) / CHART_WIDTH) * 100}
              today={history.today}
            />
          ) : null}
        </div>
        <dl className="relative h-10 text-[10px] text-muted-foreground">
          {axisDates.map((date) => {
            const x = geometry.x(date);
            const kinds = RELEASE_DATE_KIND_ORDER.filter(
              (kind) => release[RELEASE_DATE_KINDS[kind].field] === date,
            );
            return (
              <div
                key={date}
                className={cn(
                  "absolute flex flex-col gap-1",
                  x === 0
                    ? "items-start"
                    : x === CHART_WIDTH
                      ? "items-end"
                      : "items-center",
                )}
                style={{
                  left: `${(x / CHART_WIDTH) * 100}%`,
                  transform: `translateX(${x === 0 ? 0 : x === CHART_WIDTH ? -100 : -50}%)`,
                }}
              >
                <dt className="flex h-3.5 items-center gap-1">
                  <span className="sr-only">
                    {kinds
                      .map((kind) => t(RELEASE_DATE_KINDS[kind].labelKey))
                      .concat(
                        date === history.today
                          ? [t("tasks:releases.detail.today")]
                          : [],
                      )
                      .join(", ")}
                  </span>
                  {kinds.map((kind) => {
                    const milestone = RELEASE_DATE_KINDS[kind];
                    const Icon = milestone.icon;
                    return (
                      <span
                        key={kind}
                        aria-hidden="true"
                        data-milestone={kind}
                        title={t(milestone.labelKey)}
                      >
                        <Icon
                          aria-hidden="true"
                          className={cn("size-3.5", milestone.iconClassName)}
                        />
                      </span>
                    );
                  })}
                </dt>
                <dd
                  className={cn(
                    "whitespace-nowrap tabular-nums",
                    date === history.today && "text-indigo-500",
                  )}
                >
                  <time dateTime={date}>
                    {formatReleaseDate(date, { today: history.today })}
                  </time>
                </dd>
              </div>
            );
          })}
        </dl>
        <p id={`${id}-instructions`} className="sr-only">
          {t("tasks:releases.chart.instructions")}
        </p>
        {geometry.unknownUntil > 0 ? (
          <p className="mt-1 text-muted-foreground text-xs">
            {t("tasks:releases.chart.trackingSince", {
              date: formatReleaseDate(trackingDay, { today: history.today }),
            })}
          </p>
        ) : null}
      </div>
      <ReleaseProgressLegend
        counts={history.current}
        startScope={history.startScope}
        upcoming={upcoming}
        predicted={predictedProgress(
          release,
          history.current.scope,
          history.today,
        )}
      />
    </div>
  );
}
