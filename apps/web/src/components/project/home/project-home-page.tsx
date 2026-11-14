import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { DocumentDraftGuardProvider } from "@/components/editor/document-draft-guard";
import PageTitle from "@/components/page-title";
import { WorkspaceQueryState } from "@/components/task/features/workspace/workspace-query-state";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import {
  type OpenDocument,
  ProjectDocuments,
} from "./documents/project-documents";
import { ProjectOverview } from "./overview/project-overview";
import type { ProjectHomeTab } from "./project-home-search";

const TAB_CLASS = "h-7 px-2 text-xs sm:h-7 sm:text-xs";

export function ProjectHomePage({
  workspaceId,
  projectId,
  tab,
  openDocument,
  onTabChange,
  onOpenDocument,
}: {
  workspaceId: string;
  projectId: string;
  tab: ProjectHomeTab;
  openDocument: OpenDocument | null;
  onTabChange: (tab: ProjectHomeTab) => void;
  onOpenDocument: (document: OpenDocument | null) => void;
}) {
  const { t } = useTranslation();
  const project = useGetProject({ id: projectId, workspaceId });
  const { canReadDocuments, isCheckingPermissions } = useWorkspacePermission();
  const showDocuments = canReadDocuments() || isCheckingPermissions;

  return (
    <DocumentDraftGuardProvider key={projectId}>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          onTabChange(value === "documents" ? "documents" : "overview")
        }
        className="contents"
      >
        <ProjectLayout
          projectId={projectId}
          workspaceId={workspaceId}
          activeView="home"
          summary={
            <TabsList
              aria-label={t("tasks:projectHome.tabs.label")}
              className="shrink-0"
            >
              <TabsTab value="overview" className={TAB_CLASS}>
                {t("tasks:projectHome.tabs.overview")}
              </TabsTab>
              {showDocuments && (
                <TabsTab value="documents" className={TAB_CLASS}>
                  {t("tasks:projectHome.tabs.documents")}
                </TabsTab>
              )}
            </TabsList>
          }
        >
          <PageTitle title={project.data?.name ?? ""} />
          <TabsPanel
            value="overview"
            className="h-full min-h-0 overflow-y-auto bg-card"
          >
            {tab === "overview" &&
              (project.data ? (
                <ProjectOverview
                  // A fresh form per project, so one project's draft never
                  // saves into another.
                  key={project.data.id}
                  project={project.data}
                  workspaceId={workspaceId}
                />
              ) : (
                <div className="mx-auto w-full max-w-225 px-4 pt-8 sm:px-12 sm:pt-14">
                  <WorkspaceQueryState
                    error={project.isError}
                    onRetry={() => void project.refetch()}
                  />
                </div>
              ))}
          </TabsPanel>
          <TabsPanel
            value="documents"
            className="h-full min-h-0 overflow-y-auto bg-card"
          >
            {tab === "documents" &&
              (canReadDocuments() ? (
                <ProjectDocuments
                  workspaceId={workspaceId}
                  projectId={projectId}
                  openDocument={openDocument}
                  onOpenDocument={onOpenDocument}
                />
              ) : isCheckingPermissions ? null : (
                <p className="mx-auto w-full max-w-225 px-4 pt-8 text-muted-foreground text-sm sm:px-12 sm:pt-14">
                  {t("tasks:projectHome.documents.noAccess")}
                </p>
              ))}
          </TabsPanel>
        </ProjectLayout>
      </Tabs>
    </DocumentDraftGuardProvider>
  );
}
