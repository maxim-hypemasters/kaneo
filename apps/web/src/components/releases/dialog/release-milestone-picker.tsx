import { Diamond, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReleaseMilestoneCandidate } from "@/fetchers/release/get-release-milestone-candidates";
import { useReleaseMilestoneCandidates } from "@/hooks/queries/release/use-release-milestone-candidates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function ReleaseMilestonePicker({
  projectId,
  value,
  onChange,
  disabled,
  conflict,
  conflictVersion,
}: {
  projectId: string;
  value: ReleaseMilestoneCandidate[];
  onChange: (value: ReleaseMilestoneCandidate[]) => void;
  disabled: boolean;
  conflict: boolean;
  conflictVersion: number;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const pickerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoringFocus = useRef(false);
  const outsidePointer = useRef(false);
  const refreshedConflict = useRef(0);
  const resultsId = useId();
  const errorId = useId();
  const query = useDebouncedValue(search.trim(), 200);
  const candidates = useReleaseMilestoneCandidates(
    projectId,
    query,
    page,
    expanded && !disabled,
  );
  const { refetch } = candidates;
  const totalPages = candidates.data?.pagination.totalPages ?? 0;
  const ids = new Set(value.map(({ id }) => id));

  useEffect(() => {
    if (!expanded) return;
    const trackPointer = (event: PointerEvent) => {
      outsidePointer.current =
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target);
    };
    const dismissAfterClick = (event: MouseEvent) => {
      outsidePointer.current = false;
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      )
        setExpanded(false);
    };
    const cancelPointer = () => {
      const wasOutside = outsidePointer.current;
      outsidePointer.current = false;
      if (wasOutside) setExpanded(false);
    };
    document.addEventListener("pointerdown", trackPointer, true);
    document.addEventListener("click", dismissAfterClick);
    document.addEventListener("pointercancel", cancelPointer, true);
    return () => {
      outsidePointer.current = false;
      document.removeEventListener("pointerdown", trackPointer, true);
      document.removeEventListener("click", dismissAfterClick);
      document.removeEventListener("pointercancel", cancelPointer, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded || disabled || conflictVersion <= refreshedConflict.current)
      return;
    refreshedConflict.current = conflictVersion;
    void refetch();
  }, [expanded, disabled, conflictVersion, refetch]);

  return (
    <section
      ref={pickerRef}
      className="min-w-0 space-y-2"
      aria-label={t("tasks:releases.milestonePicker.title")}
      onBlur={(event) => {
        // An outside pointer may target the footer. Keep its layout stable
        // until the click completes so the button does not move on mouseup.
        if (outsidePointer.current) return;
        if (!event.currentTarget.contains(event.relatedTarget))
          setExpanded(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        event.preventDefault();
        event.stopPropagation();
        setExpanded(false);
        restoringFocus.current = true;
        searchRef.current?.focus();
        restoringFocus.current = false;
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {t("tasks:releases.milestonePicker.title")}
        </h3>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {t("tasks:releases.milestonePicker.selectedCount", {
            count: value.length,
          })}
        </span>
      </div>
      <Input
        ref={searchRef}
        type="search"
        value={search}
        disabled={disabled}
        maxLength={255}
        aria-label={t("tasks:releases.milestonePicker.search")}
        placeholder={t("tasks:releases.milestonePicker.search")}
        aria-controls={expanded ? resultsId : undefined}
        aria-invalid={conflict || undefined}
        aria-describedby={conflict ? errorId : undefined}
        onFocus={() => {
          if (!disabled && !restoringFocus.current) setExpanded(true);
        }}
        onClick={() => !disabled && setExpanded(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      {conflict && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {t("tasks:releases.milestonePicker.conflict")}
        </p>
      )}
      {value.length > 0 && (
        <div
          aria-label={t("tasks:releases.milestonePicker.selected")}
          className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto"
        >
          {value.map((candidate) => (
            <Button
              key={candidate.id}
              type="button"
              size="xs"
              variant="secondary"
              disabled={disabled}
              className="max-w-full"
              title={`${candidate.featureTitle} · ${candidate.title}`}
              aria-label={t("tasks:releases.milestonePicker.remove", {
                title: `${candidate.featureTitle} · ${candidate.title}`,
              })}
              onClick={() =>
                onChange(value.filter(({ id }) => id !== candidate.id))
              }
            >
              <span className="truncate">
                {candidate.featureTitle} · {candidate.title}
              </span>
              <X aria-hidden="true" />
            </Button>
          ))}
        </div>
      )}
      {expanded && (
        <div id={resultsId} className="min-w-0 space-y-2">
          {candidates.isPending && (
            <p role="status" className="py-2 text-sm text-muted-foreground">
              {t("tasks:releases.milestonePicker.loading")}
            </p>
          )}
          {candidates.isError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>{t("tasks:releases.milestonePicker.loadError")}</span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={disabled || candidates.isFetching}
                onClick={() => void candidates.refetch()}
              >
                {t("common:error.tryAgain")}
              </Button>
            </div>
          )}
          {candidates.data &&
            !candidates.isError &&
            candidates.data.data.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">
                {t(
                  query
                    ? "tasks:releases.milestonePicker.noMatches"
                    : "tasks:releases.milestonePicker.empty",
                )}
              </p>
            )}
          {candidates.data && candidates.data.data.length > 0 && (
            <fieldset
              disabled={disabled}
              className="max-h-52 min-w-0 overflow-y-auto rounded-lg border border-border p-1"
            >
              <legend className="sr-only">
                {t("tasks:releases.milestonePicker.title")}
              </legend>
              {candidates.data.data.map((candidate) => (
                <Label
                  key={candidate.id}
                  className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm font-normal hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <Checkbox
                    checked={ids.has(candidate.id)}
                    disabled={
                      disabled ||
                      (!ids.has(candidate.id) && value.length >= 100)
                    }
                    onCheckedChange={(checked) => {
                      if (disabled) return;
                      if (!checked)
                        onChange(value.filter(({ id }) => id !== candidate.id));
                      else if (!ids.has(candidate.id) && value.length < 100)
                        onChange([...value, candidate]);
                    }}
                  />
                  <Diamond
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-xs text-muted-foreground"
                      title={candidate.featureTitle}
                    >
                      {candidate.featureTitle}
                    </span>{" "}
                    <span className="block truncate" title={candidate.title}>
                      {candidate.title}
                    </span>
                  </span>
                </Label>
              ))}
            </fieldset>
          )}
          {value.length >= 100 && (
            <p className="text-xs text-muted-foreground">
              {t("tasks:releases.milestonePicker.limit")}
            </p>
          )}
          {(totalPages > 1 || page > 1) && (
            <nav
              aria-label={t("common:pagination.label")}
              className="flex items-center justify-between gap-2"
            >
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={disabled || page <= 1 || candidates.isFetching}
                aria-label={t("common:pagination.previousPage")}
                onClick={() => setPage((current) => current - 1)}
              >
                {t("common:pagination.previous")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("tasks:releases.link.pageLabel", {
                  page,
                  total: Math.max(page, totalPages),
                })}
              </span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={
                  disabled || page >= totalPages || candidates.isFetching
                }
                aria-label={t("common:pagination.nextPage")}
                onClick={() => setPage((current) => current + 1)}
              >
                {t("common:pagination.next")}
              </Button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}
