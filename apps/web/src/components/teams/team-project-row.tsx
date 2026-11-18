import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { TeamProject } from "@/fetchers/team/types";
import { TeamProjectIcon } from "./team-project-icon";

export function TeamProjectRow({
  project,
  canEdit,
  disabled,
  onUnlink,
}: {
  project: TeamProject;
  canEdit: boolean;
  disabled: boolean;
  onUnlink: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex min-h-9 items-center gap-2.5 px-4 py-1">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
        <TeamProjectIcon icon={project.icon} className="size-3.5" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm">{project.name}</p>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onUnlink}
          aria-label={t("teams:card.unlinkProject", { name: project.name })}
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}
