import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentDraftNavigation } from "@/components/editor/document-draft-guard";
import { WorkspaceQueryState } from "@/components/task/features/workspace/workspace-query-state";
import { Button } from "@/components/ui/button";
import type {
  FeatureDocumentGroup as FeatureDocumentGroupData,
  ProjectPageSummary,
} from "@/fetchers/project-document/types";
import { useCreateProjectDocument } from "@/hooks/mutations/project-document/use-create-project-document";
import { useDeleteProjectDocument } from "@/hooks/mutations/project-document/use-delete-project-document";
import { useMoveProjectDocument } from "@/hooks/mutations/project-document/use-move-project-document";
import { projectDocumentsKey } from "@/hooks/queries/project-document/project-document-keys";
import { useProjectDocuments } from "@/hooks/queries/project-document/use-project-documents";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { DeletePageDialog } from "./delete-page-dialog";
import { FeatureDocumentGroup } from "./feature-document-group";
import { MovePageDialog } from "./move-page-dialog";
import { OpenFeatureDocument } from "./open-feature-document";
import { OpenProjectPage } from "./open-project-page";
import { DocumentTree } from "./tree/document-tree";
import { ancestorIds, descendantIds, type TreePage } from "./tree/page-tree";

export type OpenDocument = { id: string; featureId?: string };

// Moving a page with the dialog puts it after its new siblings.
const LAST = 100_000;
const NO_PAGES: ProjectPageSummary[] = [];
const NO_FEATURES: FeatureDocumentGroupData[] = [];

function toggled(set: ReadonlySet<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function withAll(set: ReadonlySet<string>, ids: readonly string[]) {
  return ids.every((id) => set.has(id)) ? set : new Set([...set, ...ids]);
}

export function ProjectDocuments({
  workspaceId,
  projectId,
  openDocument,
  onOpenDocument,
}: {
  workspaceId: string;
  projectId: string;
  openDocument: OpenDocument | null;
  onOpenDocument: (document: OpenDocument | null) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canUpdateTasks, canDeleteTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const canDelete = canDeleteTasks();
  const requestLeave = useDocumentDraftNavigation();
  const tree = useProjectDocuments(projectId);
  const pages = tree.data?.pages ?? NO_PAGES;
  const features = tree.data?.features ?? NO_FEATURES;
  const create = useCreateProjectDocument(projectId);
  const move = useMoveProjectDocument(projectId);
  const remove = useDeleteProjectDocument(projectId);
  const [expandedPages, setExpandedPages] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedFeatures, setExpandedFeatures] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The page just created opens with its title selected.
  const [createdId, setCreatedId] = useState<string>();
  const [moving, setMoving] = useState<TreePage | null>(null);
  const [deleting, setDeleting] = useState<TreePage | null>(null);

  // Reveal the open document in the tree.
  const openId = openDocument?.id;
  const openFeatureId = openDocument?.featureId;
  useEffect(() => {
    if (!openId) return;
    if (openFeatureId)
      setExpandedFeatures((current) => withAll(current, [openFeatureId]));
    else
      setExpandedPages((current) =>
        withAll(current, ancestorIds(pages, openId)),
      );
  }, [openId, openFeatureId, pages]);

  const back = useCallback(() => {
    void requestLeave(() => {
      setCreatedId(undefined);
      onOpenDocument(null);
      // Feature document titles show here too.
      void queryClient.invalidateQueries({
        queryKey: projectDocumentsKey(projectId),
        exact: true,
      });
    });
  }, [onOpenDocument, projectId, queryClient, requestLeave]);

  const createPage = (parentId: string | null) =>
    create.mutate(
      { title: t("tasks:projectHome.documents.untitled"), parentId },
      {
        onSuccess: (page) => {
          if (parentId)
            setExpandedPages((current) => withAll(current, [parentId]));
          setCreatedId(page.id);
          onOpenDocument({ id: page.id });
        },
      },
    );

  const movePage = (id: string, parentId: string | null, index: number) => {
    if (parentId) setExpandedPages((current) => withAll(current, [parentId]));
    return move.mutateAsync({ id, parentId, index });
  };

  const deletingSubPages = deleting
    ? descendantIds(pages, deleting.id)
    : new Set<string>();

  return (
    <div className="mx-auto w-full max-w-225 px-4 pt-6 pb-16 sm:px-12 sm:pt-10">
      {openDocument &&
        (openDocument.featureId ? (
          <OpenFeatureDocument
            projectId={projectId}
            featureId={openDocument.featureId}
            documentId={openDocument.id}
            onBack={back}
          />
        ) : (
          <OpenProjectPage
            projectId={projectId}
            documentId={openDocument.id}
            subPageCount={descendantIds(pages, openDocument.id).size}
            focusTitle={createdId === openDocument.id}
            onBack={back}
          />
        ))}

      <section aria-labelledby="project-pages-heading">
        <div className="mb-2 flex items-center gap-2">
          <h2
            id="project-pages-heading"
            className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
          >
            {t("tasks:projectHome.documents.pages")}
          </h2>
          {canEdit && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="ml-auto"
              loading={create.isPending}
              onClick={() => createPage(null)}
            >
              <Plus aria-hidden="true" />
              {t("tasks:projectHome.documents.newPage")}
            </Button>
          )}
        </div>
        {create.isError && (
          <p role="alert" className="mb-2 text-destructive text-sm">
            {t("tasks:projectHome.documents.createFailed")}
          </p>
        )}
        {move.isError && !moving && (
          <p role="alert" className="mb-2 text-destructive text-sm">
            {t("tasks:projectHome.documents.moveFailed")}
          </p>
        )}
        {tree.isPending || (tree.isError && !tree.data) ? (
          <WorkspaceQueryState
            error={tree.isError}
            onRetry={() => void tree.refetch()}
          />
        ) : pages.length ? (
          <DocumentTree
            pages={pages}
            expanded={expandedPages}
            selectedId={openFeatureId ? undefined : openId}
            canEdit={canEdit}
            canDelete={canDelete}
            onToggle={(id) =>
              setExpandedPages((current) => toggled(current, id))
            }
            onOpen={(id) => onOpenDocument({ id })}
            onAddChild={(parentId) => createPage(parentId)}
            onMove={({ id, parentId, index }) =>
              void movePage(id, parentId, index).catch(() => {})
            }
            onRequestMove={(page) => {
              move.reset();
              setMoving(page);
            }}
            onRequestDelete={(page) => {
              remove.reset();
              setDeleting(page);
            }}
          />
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
            {t(
              canEdit
                ? "tasks:projectHome.documents.empty"
                : "tasks:projectHome.documents.emptyReadOnly",
            )}
          </p>
        )}
      </section>

      {features.length > 0 && (
        <section aria-labelledby="feature-documents-heading" className="mt-10">
          <h2
            id="feature-documents-heading"
            className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide"
          >
            {t("tasks:projectHome.documents.featureDocuments")}
          </h2>
          <ul>
            {features.map((group) => (
              <FeatureDocumentGroup
                key={group.id}
                group={group}
                workspaceId={workspaceId}
                projectId={projectId}
                expanded={expandedFeatures.has(group.id)}
                selectedId={openFeatureId === group.id ? openId : undefined}
                onToggle={() =>
                  setExpandedFeatures((current) => toggled(current, group.id))
                }
                onOpen={(id) => onOpenDocument({ id, featureId: group.id })}
              />
            ))}
          </ul>
        </section>
      )}

      <MovePageDialog
        key={moving?.id ?? "closed"}
        page={moving}
        pages={pages}
        pending={move.isPending}
        failed={move.isError}
        onOpenChange={(open) => {
          if (!open) setMoving(null);
        }}
        onMove={(parentId) => {
          if (!moving) return;
          void movePage(moving.id, parentId, LAST)
            .then(() => setMoving(null))
            .catch(() => {});
        }}
      />
      <DeletePageDialog
        open={deleting !== null}
        title={deleting?.title || t("tasks:projectHome.documents.untitled")}
        subPageCount={deletingSubPages.size}
        pending={remove.isPending}
        failed={remove.isError}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          const removed = new Set([deleting.id, ...deletingSubPages]);
          void remove
            .mutateAsync(deleting.id)
            .then(() => {
              setDeleting(null);
              if (openId && !openFeatureId && removed.has(openId))
                onOpenDocument(null);
            })
            .catch(() => {});
        }}
      />
    </div>
  );
}
