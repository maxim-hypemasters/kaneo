import { FileText, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentDraftNavigation } from "@/components/editor/document-draft-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateFeatureDocument } from "@/hooks/mutations/feature/use-create-feature-document";
import {
  useFeatureDocument,
  useFeatureDocuments,
} from "@/hooks/queries/feature/use-feature-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatRelativeTime } from "@/lib/format";
import { FeatureDocumentPage } from "./feature-document-page";
import { FeatureDocumentWindow } from "./feature-document-window";
import { WorkspacePagination } from "./workspace-pagination";
import { WorkspaceQueryState } from "./workspace-query-state";

export function FeatureDocuments({
  featureId,
  projectId,
  selectedDocumentId,
  onDocumentChange,
}: {
  featureId: string;
  projectId: string;
  selectedDocumentId?: string;
  onDocumentChange: (id?: string) => void;
}) {
  const { t } = useTranslation();
  const { canUpdateFeatures } = useWorkspacePermission();
  const requestLeave = useDocumentDraftNavigation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // The document just created opens with its title selected.
  const [createdId, setCreatedId] = useState<string>();
  const create = useCreateFeatureDocument(projectId, featureId);
  // Not read while a page is open over it.
  const list = useFeatureDocuments(
    projectId,
    featureId,
    search,
    page,
    !selectedDocumentId,
  );
  const document = useFeatureDocument(projectId, featureId, selectedDocumentId);
  const back = useCallback(() => {
    void requestLeave(() => {
      setCreatedId(undefined);
      onDocumentChange(undefined);
    });
  }, [requestLeave, onDocumentChange]);
  // The open page covers the screen; the list stays underneath it.
  const openPage = selectedDocumentId ? (
    document.data ? (
      <FeatureDocumentPage
        key={selectedDocumentId}
        featureId={featureId}
        projectId={projectId}
        document={document.data}
        focusTitle={createdId === selectedDocumentId}
        onBack={back}
        refresh={() => document.refetch({ throwOnError: true })}
      />
    ) : (
      <FeatureDocumentWindow
        title={t("tasks:features.workspace.documentBody")}
        onClose={back}
      >
        <WorkspaceQueryState
          error={document.isError}
          onRetry={() => void document.refetch()}
        />
      </FeatureDocumentWindow>
    )
  ) : null;
  return (
    <section className="space-y-4">
      {openPage}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t("tasks:features.workspace.searchDocuments")}
          aria-label={t("tasks:features.workspace.searchDocuments")}
          className="min-w-0 flex-1"
        />
        {canUpdateFeatures() && (
          <Button
            type="button"
            size="sm"
            loading={create.isPending}
            onClick={() =>
              create.mutate(t("tasks:features.workspace.untitledDocument"), {
                onSuccess: (value) => {
                  setCreatedId(value.id);
                  onDocumentChange(value.id);
                },
              })
            }
          >
            <Plus className="size-3.5" />
            {t("tasks:features.workspace.newDocument")}
          </Button>
        )}
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t("tasks:features.workspace.createDocumentFailed")}
        </p>
      )}
      {list.isPending || (list.isError && !list.data) ? (
        <WorkspaceQueryState
          error={list.isError}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <>
          {!list.data?.data.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t(
                search
                  ? "tasks:features.workspace.noDocumentResults"
                  : "tasks:features.workspace.noDocuments",
              )}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {list.data.data.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onDocumentChange(item.id)}
                    className="flex w-full min-w-0 items-center gap-3 p-3 text-left outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-sm font-medium"
                        title={item.title}
                      >
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t("tasks:features.workspace.documentListUpdated", {
                          name:
                            item.updatedByName || t("common:people.someone"),
                          date: formatRelativeTime(item.updatedAt),
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <WorkspacePagination
            page={page}
            totalPages={list.data?.pagination.totalPages ?? 0}
            pending={list.isFetching}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}
