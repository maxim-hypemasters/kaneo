import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Layers } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getFeatureLibrary,
  archiveFeature,
} from "@/fetchers/task/feature-library";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "@/lib/toast";
import { ArchiveFeatureDialog } from "./archive-feature-dialog";

export function FeatureLibraryPage({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 200);
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [featureToArchive, setFeatureToArchive] = useState<{
    id: string;
    title: string;
    projectId: string;
  } | null>(null);
  const { canUpdateTasks } = useWorkspacePermission();
  const result = useQuery({
    queryKey: ["feature-library", projectId, query, archived, page],
    queryFn: () => getFeatureLibrary(projectId, query, archived, page),
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archiveFeature(id, archived),
    onSuccess: () => {
      void cache.invalidateQueries({
        queryKey: ["feature-library", projectId],
      });
      void cache.invalidateQueries({
        queryKey: ["project-features", projectId],
      });
      void cache.invalidateQueries({ queryKey: ["task"] });
    },
    onError: () => toast.error(t("tasks:features.library.saveError")),
  });
  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="features"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-xl font-semibold">
          {t("tasks:features.library.title")}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-md"
            value={search}
            placeholder={t("tasks:features.library.search")}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Button
            variant={archived ? "outline" : "secondary"}
            onClick={() => {
              setArchived(false);
              setPage(1);
            }}
          >
            {t("tasks:features.library.active")}
          </Button>
          <Button
            variant={archived ? "secondary" : "outline"}
            onClick={() => {
              setArchived(true);
              setPage(1);
            }}
          >
            {t("tasks:features.library.archived")}
          </Button>
        </div>
        {result.isPending ? (
          <p role="status">{t("common:empty.loading")}</p>
        ) : result.isError ? (
          <div role="alert">
            <p>{t("common:error.title")}</p>
            <Button onClick={() => void result.refetch()}>
              {t("common:error.tryAgain")}
            </Button>
          </div>
        ) : (
          <>
            {!result.data.data.length && (
              <p className="py-8 text-center text-muted-foreground">
                {t("tasks:features.library.empty")}
              </p>
            )}
            <div className="divide-y rounded-lg border">
              {result.data.data.map((feature) => (
                <div
                  key={feature.id}
                  className="flex items-center gap-3 p-3 sm:p-4"
                >
                  <Layers className="size-4 shrink-0 text-muted-foreground" />
                  <Link
                    className="min-w-0 flex-1"
                    to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                    params={{ workspaceId, projectId, taskId: feature.id }}
                  >
                    <span className="block font-medium">{feature.title}</span>
                    {feature.description && (
                      <span className="mt-1 block truncate text-sm text-muted-foreground">
                        {feature.description.replace(/[#*`>[\]]/g, "")}
                      </span>
                    )}
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {t("tasks:features.library.milestoneCount", {
                        count: feature.milestoneCount,
                      })}
                      {feature.labels?.map((label) => (
                        <Badge
                          key={label.id}
                          color={label.color}
                          variant="outline"
                        >
                          {label.name}
                        </Badge>
                      ))}
                    </span>
                  </Link>
                  {canUpdateTasks() && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={archive.isPending}
                      aria-label={t(
                        archived
                          ? "tasks:features.library.restore"
                          : "tasks:features.library.archive",
                      )}
                      onClick={() => {
                        if (archived)
                          archive.mutate({ id: feature.id, archived: false });
                        else
                          setFeatureToArchive({
                            id: feature.id,
                            title: feature.title,
                            projectId,
                          });
                      }}
                    >
                      {archived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {result.data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("common:pagination.previous")}
                </Button>
                <span className="text-sm tabular-nums">
                  {page}/{result.data.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  disabled={page >= result.data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("common:pagination.next")}
                </Button>
              </div>
            )}
          </>
        )}
        <ArchiveFeatureDialog
          feature={featureToArchive}
          onOpenChange={(open) => {
            if (!open) setFeatureToArchive(null);
          }}
        />
      </div>
    </ProjectLayout>
  );
}
