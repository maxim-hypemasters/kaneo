import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function GanttHideWeekendsSwitch() {
  const { t } = useTranslation();
  const id = useId();
  const checked = useUserPreferencesStore((state) => state.ganttHideWeekends);
  const setChecked = useUserPreferencesStore(
    (state) => state.setGanttHideWeekends,
  );

  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">
        {t("tasks:display.ganttHideWeekends")}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={setChecked} />
    </div>
  );
}
