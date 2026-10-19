import { useTranslation } from "react-i18next";
import type { TaskType } from "@/types/task";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { TASK_TYPE_LABELS } from "@/lib/task-type";

export function TaskTypeValue({ type }: { type: TaskType | undefined }) {
  const { t } = useTranslation();

  return (
    <>
      <TaskTypeGlyph type={type} decorative className="text-muted-foreground" />
      <span className="truncate">{t(TASK_TYPE_LABELS[type ?? "task"])}</span>
    </>
  );
}
