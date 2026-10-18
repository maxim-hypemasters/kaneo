import { Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { TaskRelease } from "./task-release-lookup";

type ReleaseValueProps = {
  release: TaskRelease<{ name: string }>;
  className?: string;
};

export function ReleaseValue({ release, className }: ReleaseValueProps) {
  const { t } = useTranslation();

  return (
    <>
      <Rocket aria-hidden="true" className="text-muted-foreground" />
      <span
        className={cn(
          "truncate",
          release === null && "text-muted-foreground",
          className,
        )}
      >
        {release === null
          ? t("tasks:releases.none")
          : release === "unknown"
            ? t("tasks:releases.unknown")
            : release?.name}
      </span>
    </>
  );
}
