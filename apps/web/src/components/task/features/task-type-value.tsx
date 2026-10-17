import { Layers, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskType } from "@/types/task";

export function TaskTypeValue({ type }: { type: TaskType | undefined }) {
  const { t } = useTranslation();
  const isFeature = type === "feature";
  const Icon = isFeature ? Layers : Square;

  return (
    <>
      <Icon aria-hidden="true" className="text-muted-foreground" />
      <span className="truncate">
        {isFeature
          ? t("tasks:features.typeFeature")
          : t("tasks:features.typeTask")}
      </span>
    </>
  );
}
