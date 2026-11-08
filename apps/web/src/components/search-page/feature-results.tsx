import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { featureRoute } from "@/components/task/features/feature-route";
import { Badge } from "@/components/ui/badge";
import type { SearchResultItem } from "@/fetchers/search/global-search";

type FeatureResultsProps = {
  workspaceId: string;
  results: SearchResultItem[];
};

export function FeatureResults({ workspaceId, results }: FeatureResultsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const features = results.flatMap(({ projectId, ...result }) =>
    result.type === "feature" && projectId ? [{ ...result, projectId }] : [],
  );
  if (!features.length) return null;

  return (
    <section aria-labelledby={headingId} className="space-y-1">
      <h2
        id={headingId}
        className="mb-3 font-medium text-muted-foreground text-xs"
      >
        {t("navigation:search.groups.feature")}
      </h2>
      <ul className="space-y-1">
        {features.map((feature) => (
          <li key={feature.id}>
            <Link
              {...featureRoute(workspaceId, feature.projectId, feature.id)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-accent/60 sm:gap-3 sm:px-4"
            >
              <TaskTypeGlyph
                type="feature"
                decorative
                className="size-4 shrink-0 text-muted-foreground"
              />
              {feature.projectSlug && feature.taskNumber && (
                <span className="shrink-0 font-mono text-muted-foreground text-xs">
                  {feature.projectSlug}-{feature.taskNumber}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-foreground text-sm">
                {feature.title}
              </span>
              {feature.projectName && (
                <span className="hidden shrink-0 text-muted-foreground text-xs sm:inline">
                  {feature.projectName}
                </span>
              )}
              {feature.archived && (
                <Badge variant="outline" className="shrink-0">
                  {t("tasks:features.library.archived")}
                </Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
