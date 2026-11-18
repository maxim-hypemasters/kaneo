import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { ProjectTeamsCard } from "./project-teams-card";

// The Overview's right column.
export function ProjectPropertiesRail({
  projectId,
  workspaceId,
  className,
}: {
  projectId: string;
  workspaceId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t("tasks:properties.title")}
      className={cn("flex flex-col gap-4", className)}
    >
      <ProjectTeamsCard projectId={projectId} workspaceId={workspaceId} />
    </aside>
  );
}
