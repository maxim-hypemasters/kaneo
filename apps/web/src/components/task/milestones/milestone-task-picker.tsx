import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMilestoneCandidates } from "@/hooks/queries/milestone/use-milestone-candidates";
import { TASK_TYPE_LABELS } from "@/lib/task-type";
const PAGE_SIZE = 100;
const EMPTY_TASKS = [] as const;
export function MilestoneTaskPicker({
  projectId,
  featureId,
  value,
  onChange,
  disabled,
  onUnavailableChange,
}: {
  projectId: string;
  featureId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  onUnavailableChange?: (unavailable: boolean) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const candidates = useMilestoneCandidates(projectId, featureId);
  const tasks = useMemo(
    () =>
      candidates.data?.tasks.filter((task) => task.milestoneId === null) ??
      EMPTY_TASKS,
    [candidates.data],
  );
  const ids = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const unavailable =
    candidates.data !== undefined && value.some((id) => !ids.has(id));
  useEffect(() => {
    onUnavailableChange?.(unavailable);
  }, [onUnavailableChange, unavailable]);
  const needle = search.trim().toLocaleLowerCase();
  const matches = tasks.filter(
    (task) =>
      !needle ||
      [
        task.title,
        task.id,
        task.number === null
          ? ""
          : `${candidates.data?.projectSlug}-${task.number}`,
      ].some((text) => text.toLocaleLowerCase().includes(needle)),
  );
  return (
    <Fieldset className="max-w-none gap-2" disabled={disabled}>
      <FieldsetLegend className="flex w-full items-center justify-between gap-2 text-sm">
        <span>{t("tasks:milestones.linkTasks")}</span>
        <span
          aria-live="polite"
          className="text-xs font-normal text-muted-foreground"
        >
          {t("tasks:milestones.selectedCount", { count: value.length })}
        </span>
      </FieldsetLegend>
      <Input
        size="sm"
        aria-label={t("tasks:milestones.searchTasks")}
        placeholder={t("tasks:milestones.searchTasks")}
        value={search}
        disabled={disabled}
        onChange={(event) => {
          setSearch(event.target.value);
          setVisibleCount(PAGE_SIZE);
        }}
      />
      {candidates.isPending && (
        <p role="status" className="py-2 text-xs text-muted-foreground">
          {t("tasks:milestones.loadingTasks")}
        </p>
      )}
      {candidates.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 text-xs"
        >
          <p>{t("tasks:milestones.loadTasksError")}</p>
          <Button
            size="xs"
            type="button"
            variant="ghost"
            disabled={disabled || candidates.isFetching}
            onClick={() => void candidates.refetch()}
          >
            {t("common:error.tryAgain")}
          </Button>
        </div>
      )}
      {unavailable && (
        <div role="alert" className="space-y-1 text-xs">
          <p>{t("tasks:milestones.unavailableTasks")}</p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={() => onChange(value.filter((id) => ids.has(id)))}
          >
            {t("tasks:milestones.removeUnavailableTasks")}
          </Button>
        </div>
      )}
      {!candidates.isPending && !candidates.isError && matches.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">
          {t(
            tasks.length === 0
              ? "tasks:milestones.noUnassignedTasks"
              : "tasks:milestones.noTaskMatches",
          )}
        </p>
      )}
      {matches.length > 0 && (
        <CheckboxGroup
          aria-label={t("tasks:milestones.linkTasks")}
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          className="max-h-52 w-full items-stretch gap-0 overflow-y-auto rounded-lg border border-border p-1"
        >
          {matches.slice(0, visibleCount).map((task) => (
            <Label
              key={task.id}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[13px] font-normal hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <Checkbox value={task.id} disabled={disabled} />
              <TaskTypeGlyph
                type={task.type}
                decorative
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    {task.number === null
                      ? task.id
                      : `${candidates.data?.projectSlug}-${task.number}`}
                  </span>
                  <span>{t(TASK_TYPE_LABELS[task.type])}</span>
                </span>
                <span
                  className="block truncate text-foreground"
                  title={task.title}
                >
                  {task.title}
                </span>
              </span>
            </Label>
          ))}
        </CheckboxGroup>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {matches.length > visibleCount && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={disabled}
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            {t("tasks:milestones.showMoreTasks")}
          </Button>
        )}
        {value.length > 0 && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            {t("tasks:milestones.clearTasks")}
          </Button>
        )}
      </div>
    </Fieldset>
  );
}
