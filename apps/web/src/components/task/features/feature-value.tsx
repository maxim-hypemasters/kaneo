import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { FeatureSummary } from "./feature-lookup";

type FeatureValueProps = {
  // null for no feature, undefined while it loads.
  feature: FeatureSummary | null | undefined;
  displayId: string | null;
  className?: string;
};

export function FeatureValue({
  feature,
  displayId,
  className,
}: FeatureValueProps) {
  const { t } = useTranslation();

  return (
    <>
      <Layers aria-hidden="true" className="text-muted-foreground" />
      {displayId && (
        <span className="shrink-0 font-mono text-muted-foreground text-xs">
          {displayId}
        </span>
      )}
      <span
        className={cn(
          "truncate",
          feature === null && "text-muted-foreground",
          className,
        )}
      >
        {feature === null
          ? t("tasks:features.none")
          : feature && (feature.title ?? t("tasks:features.unknown"))}
      </span>
    </>
  );
}
