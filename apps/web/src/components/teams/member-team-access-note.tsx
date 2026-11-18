import { useTranslation } from "react-i18next";
import { TeamProjectIcon } from "./team-project-icon";
import type { TeamGrantedProject } from "./team-projects-for-member";

// Shown with "Selected projects": these stay open to the member whatever is
// picked above, because their teams are linked to them.
export function MemberTeamAccessNote({
  granted,
}: {
  granted: readonly TeamGrantedProject[];
}) {
  const { t } = useTranslation();
  if (granted.length === 0) return null;
  return (
    <section
      aria-label={t("teams:accessNote.title")}
      className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
    >
      <p className="text-xs font-medium">{t("teams:accessNote.title")}</p>
      <p className="text-xs text-muted-foreground">
        {t("teams:accessNote.description")}
      </p>
      <ul className="mt-2 space-y-1">
        {granted.map(({ project, teamNames }) => (
          <li
            key={project.id}
            className="flex min-w-0 items-center gap-2 text-xs"
          >
            <TeamProjectIcon
              icon={project.icon}
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="truncate font-medium">{project.name}</span>
            <span className="truncate text-muted-foreground">
              {t("teams:accessNote.via", { teams: teamNames.join(", ") })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
