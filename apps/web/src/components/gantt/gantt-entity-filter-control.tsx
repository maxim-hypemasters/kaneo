import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function GanttEntityFilterControl() {
  const { t } = useTranslation();
  const entities = useUserPreferencesStore((state) => state.ganttEntities);
  const setEntities = useUserPreferencesStore(
    (state) => state.setGanttEntities,
  );
  const selected = entities ?? ["milestone", "task", "bug"];
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">{t("tasks:gantt.milestones.show")}</span>
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label={t("tasks:gantt.milestones.show")}
      >
        {(["milestone", "task", "bug"] as const).map((entity) => (
          <Button
            key={entity}
            type="button"
            variant={selected.includes(entity) ? "secondary" : "outline"}
            size="xs"
            aria-pressed={selected.includes(entity)}
            onClick={() =>
              setEntities(
                selected.includes(entity)
                  ? selected.filter((value) => value !== entity)
                  : [...selected, entity],
              )
            }
          >
            {entity === "milestone"
              ? t("tasks:milestones.title")
              : entity === "bug"
                ? t("tasks:features.typeBug")
                : t("tasks:features.typeTask")}
          </Button>
        ))}
      </div>
    </div>
  );
}
