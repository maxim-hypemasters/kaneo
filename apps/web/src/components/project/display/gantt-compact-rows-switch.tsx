import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function GanttCompactRowsSwitch() {
  const { t } = useTranslation();
  const id = useId();
  const checked = useUserPreferencesStore((state) => state.ganttCompactRows);
  const setChecked = useUserPreferencesStore(
    (state) => state.setGanttCompactRows,
  );

  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">
        {t("tasks:display.ganttCompactRows")}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={setChecked} />
    </div>
  );
}
