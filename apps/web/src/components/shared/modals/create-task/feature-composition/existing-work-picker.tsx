import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFeatureLinkCandidates } from "@/hooks/queries/task/use-feature-link-candidates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MAX_FEATURE_COMPOSITION_ITEMS } from "./draft";
import type { FeatureExistingTaskDraft } from "./types";

export function ExistingWorkPicker({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  value: FeatureExistingTaskDraft[];
  onChange: (value: FeatureExistingTaskDraft[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const pickerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoringFocus = useRef(false);
  const resultsId = useId();
  const query = useDebouncedValue(search.trim(), 200);
  const candidates = useFeatureLinkCandidates(
    projectId,
    query,
    page,
    expanded && !disabled,
  );
  const totalPages = candidates.data?.pagination.totalPages ?? 0;
  const ids = new Set(value.map((task) => task.id));
  useEffect(() => {
    if (!expanded) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target)
      )
        setExpanded(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [expanded]);
  return (
    <section
      ref={pickerRef}
      className="min-w-0 space-y-2"
      aria-label={t("tasks:featureComposer.linkTasks")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setExpanded(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        event.preventDefault();
        event.stopPropagation();
        setExpanded(false);
        // Returning focus must not activate the panel we just dismissed.
        restoringFocus.current = true;
        searchRef.current?.focus();
        restoringFocus.current = false;
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {t("tasks:featureComposer.linkTasks")}
        </h3>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {t("tasks:milestones.selectedCount", { count: value.length })}
        </span>
      </div>
      <Input
        ref={searchRef}
        type="search"
        size="sm"
        disabled={disabled}
        value={search}
        aria-controls={expanded ? resultsId : undefined}
        aria-label={t("tasks:featureComposer.searchTasks")}
        placeholder={t("tasks:featureComposer.searchTasks")}
        maxLength={255}
        onFocus={() => {
          if (!disabled && !restoringFocus.current) setExpanded(true);
        }}
        onClick={() => !disabled && setExpanded(true)}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      {expanded && (
        <div id={resultsId} className="min-w-0 space-y-2">
          {candidates.isPending && (
            <p role="status" className="py-2 text-xs text-muted-foreground">
              {t("tasks:featureComposer.loadingTasks")}
            </p>
          )}
          {candidates.isError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>{t("tasks:featureComposer.loadTasksError")}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
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
              <p className="py-2 text-xs text-muted-foreground">
                {t(
                  query
                    ? "tasks:featureComposer.noMatches"
                    : "tasks:featureComposer.noEligibleTasks",
                )}
              </p>
            )}
          {candidates.data && candidates.data.data.length > 0 && (
            <fieldset
              disabled={disabled}
              className="max-h-52 min-w-0 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1"
            >
              <legend className="sr-only">
                {t("tasks:featureComposer.linkTasks")}
              </legend>
              {candidates.data.data.map((candidate) => (
                <Label
                  key={candidate.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-normal hover:bg-accent/50"
                >
                  <Checkbox
                    checked={ids.has(candidate.id)}
                    disabled={
                      disabled ||
                      (!ids.has(candidate.id) &&
                        value.length >= MAX_FEATURE_COMPOSITION_ITEMS)
                    }
                    onCheckedChange={(checked) => {
                      if (disabled) return;
                      if (!checked)
                        onChange(
                          value.filter((task) => task.id !== candidate.id),
                        );
                      else if (
                        !ids.has(candidate.id) &&
                        value.length < MAX_FEATURE_COMPOSITION_ITEMS
                      )
                        onChange([
                          ...value,
                          { ...candidate, milestoneKey: null },
                        ]);
                    }}
                  />
                  <TaskTypeGlyph
                    type={candidate.type}
                    decorative
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0">
                        {candidate.number === null
                          ? candidate.id
                          : `${candidate.projectSlug}-${candidate.number}`}
                      </span>
                      <span
                        className="truncate"
                        title={candidate.releaseName ?? undefined}
                      >
                        {candidate.releaseName ??
                          t(
                            candidate.releaseId
                              ? "tasks:releases.unknown"
                              : "tasks:releases.none",
                          )}
                      </span>
                    </span>
                    <span className="block truncate" title={candidate.title}>
                      {candidate.title}
                    </span>
                  </span>
                </Label>
              ))}
            </fieldset>
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
