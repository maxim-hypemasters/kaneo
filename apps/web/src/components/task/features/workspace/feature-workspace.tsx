import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type Task from "@/types/task";
import { FeatureMilestoneOverview } from "../../milestones/feature-milestone-overview";
import { useMilestoneSelection } from "../../milestones/milestone-selection-context";
import { FeatureActivity } from "./feature-activity";
import { FeatureDocuments } from "./feature-documents";
import { FeatureOverview } from "./feature-overview";
import { FeatureIssues } from "./feature-issues";
import { FeatureTestCases } from "./feature-test-cases";
import { FEATURE_TABS, type FeatureTab } from "./feature-workspace-search";
import { useFeatureNavigation } from "./use-feature-navigation";

export function FeatureWorkspace({
  feature,
  workspaceId,
}: {
  feature: Task;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const { tab, featureDocumentId, featureUpdateId, open } =
    useFeatureNavigation();
  const { setFilter, registerSelection } = useMilestoneSelection();
  const { canReadTestCases, canReadMilestones } = useWorkspacePermission();
  // A Feature's test cases come from its milestones.
  const showTestCases = canReadTestCases() && canReadMilestones();
  const tabs = FEATURE_TABS.filter(
    (value) => value !== "testCases" || showTestCases,
  );
  useEffect(
    () =>
      registerSelection((filter) =>
        open("issues", undefined, () => setFilter(filter)),
      ),
    [open, registerSelection, setFilter],
  );
  return (
    <div className="min-w-0">
      <Tabs
        value={tab}
        onValueChange={(value) => open(value as FeatureTab)}
        className="min-w-0 gap-5"
      >
        <div className="sticky top-0 z-20 -mx-1 bg-background px-1 py-2">
          <TabsList
            aria-label={t("tasks:features.workspace.navigation")}
            className="w-full max-w-lg"
          >
            {tabs.map((value) => (
              <TabsTab
                key={value}
                value={value}
                className="min-w-0 flex-1 px-2 text-xs sm:text-sm"
              >
                {t(`tasks:features.workspace.tabs.${value}`)}
              </TabsTab>
            ))}
          </TabsList>
        </div>
        {tab === "overview" && (
          <TabsPanel value="overview">
            <FeatureOverview
              feature={feature}
              onOpenActivity={(id) => open("activity", id)}
            />
          </TabsPanel>
        )}
        {tab === "activity" && (
          <TabsPanel value="activity">
            <FeatureActivity
              featureId={feature.id}
              projectId={feature.projectId}
              selectedUpdateId={featureUpdateId}
              onUpdateChange={(id) => open("activity", id)}
            />
          </TabsPanel>
        )}
        {tab === "documents" && (
          <TabsPanel value="documents">
            <FeatureDocuments
              featureId={feature.id}
              projectId={feature.projectId}
              selectedDocumentId={featureDocumentId}
              onDocumentChange={(id) => open("documents", id)}
            />
          </TabsPanel>
        )}
        {tab === "issues" && (
          <TabsPanel value="issues">
            <FeatureIssues
              featureTitle={feature.title}
              featureId={feature.id}
              projectId={feature.projectId}
              workspaceId={workspaceId}
            />
          </TabsPanel>
        )}
        {tab === "testCases" && showTestCases && (
          <TabsPanel value="testCases">
            <FeatureTestCases
              featureId={feature.id}
              projectId={feature.projectId}
            />
          </TabsPanel>
        )}
      </Tabs>
      <div className="mt-6">
        <FeatureMilestoneOverview
          projectId={feature.projectId}
          featureId={feature.id}
          placement="inline"
        />
      </div>
    </div>
  );
}
