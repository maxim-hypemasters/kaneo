import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FeatureHealth } from "@/fetchers/feature/types";
import { cn } from "@/lib/cn";

export const featureHealthKeys = {
  "on-track": "tasks:features.workspace.health.on-track",
  "at-risk": "tasks:features.workspace.health.at-risk",
  "off-track": "tasks:features.workspace.health.off-track",
} as const;

export function FeatureHealthValue({ health }: { health: FeatureHealth }) {
  const { t } = useTranslation();
  const Icon =
    health === "on-track"
      ? CircleCheck
      : health === "at-risk"
        ? CircleAlert
        : CircleX;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        health === "on-track"
          ? "text-success"
          : health === "at-risk"
            ? "text-warning"
            : "text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(featureHealthKeys[health])}
    </span>
  );
}
