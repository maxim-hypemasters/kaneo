import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GANTT_GROUP_BY_OPTIONS,
  type GanttGroupBy,
  isGanttGroupBy,
  useUserPreferencesStore,
} from "@/store/user-preferences";

export function GanttGroupByControl() {
  const { t } = useTranslation();
  const groupBy = useUserPreferencesStore((state) => state.ganttGroupBy);
  const setGroupBy = useUserPreferencesStore((state) => state.setGanttGroupBy);
  const label = t("tasks:display.groupBy");
  const options: Record<GanttGroupBy, string> = {
    none: t("tasks:display.groupByOptions.none"),
    assignee: t("tasks:display.groupByOptions.assignee"),
    feature: t("tasks:display.groupByOptions.feature"),
  };
  const value = isGanttGroupBy(groupBy) ? groupBy : "none";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (isGanttGroupBy(next)) setGroupBy(next);
        }}
      >
        {/* Grows for longer translations ("Toegewezen persoon") instead of
            truncating the current choice. */}
        <SelectTrigger
          size="sm"
          className="w-auto min-w-36 max-w-48"
          aria-label={label}
        >
          <SelectValue>{options[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {GANTT_GROUP_BY_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {options[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
