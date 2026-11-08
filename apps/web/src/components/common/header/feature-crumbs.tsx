import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

type FeatureCrumbsProps = {
  workspaceId: string;
  projectId: string;
  label: string;
};

export function FeatureCrumbs({
  workspaceId,
  projectId,
  label,
}: FeatureCrumbsProps) {
  const { t } = useTranslation();

  return (
    <>
      <Link
        to="/dashboard/workspace/$workspaceId/project/$projectId/features"
        params={{ workspaceId, projectId }}
        className="shrink-0 text-xs text-foreground hover:underline"
      >
        {t("tasks:features.library.title")}
      </Link>
      <span aria-hidden="true" className="text-foreground/70 text-xs">
        /
      </span>
      <span
        aria-current="page"
        className="min-w-0 max-w-56 truncate text-xs text-foreground"
      >
        {label}
      </span>
    </>
  );
}
