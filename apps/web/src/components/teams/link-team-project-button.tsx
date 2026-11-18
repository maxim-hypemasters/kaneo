import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TeamProjectIcon } from "./team-project-icon";

type ProjectCandidate = { id: string; name: string; icon?: string | null };

export function LinkTeamProjectButton({
  candidates,
  loading,
  disabled,
  onLink,
}: {
  candidates: ProjectCandidate[];
  loading: boolean;
  disabled: boolean;
  onLink: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = candidates.map((project) => ({
    value: project.id,
    label: project.name,
    icon: <TeamProjectIcon icon={project.icon} className="size-4" />,
  }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={<Button type="button" variant="ghost" size="xs" />}
      >
        <FolderPlus aria-hidden="true" />
        {t("teams:card.linkProject")}
      </PopoverTrigger>
      <PopoverContent className="w-64 max-w-[calc(100vw-2rem)] p-0" align="end">
        <PopoverTitle className="sr-only">
          {t("teams:card.linkProject")}
        </PopoverTitle>
        <OptionMenu
          label={t("teams:card.linkProject")}
          placeholder={t("teams:card.searchProjects")}
          options={options}
          status={
            loading
              ? t("common:empty.loading")
              : options.length === 0
                ? t("teams:card.noProjectCandidates")
                : undefined
          }
          onSelect={(projectId) => {
            if (!projectId) return;
            setOpen(false);
            onLink(projectId);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
