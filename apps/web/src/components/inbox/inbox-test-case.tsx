import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getEventDataRecord } from "@/components/notification/notification-text";
import { Button } from "@/components/ui/button";

// A test case has no page of its own: its link opens it over the project's
// Test cases page. The inbox only lists test cases the reader can still see.
export function InboxTestCase({
  testCaseId,
  eventData,
  workspaceId,
}: {
  testCaseId: string;
  eventData: unknown;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const data = getEventDataRecord(eventData);
  const title =
    typeof data?.testCaseTitle === "string" && data.testCaseTitle
      ? data.testCaseTitle
      : t("tasks:testCases.singular");
  const projectId =
    typeof data?.projectId === "string" && data.projectId
      ? data.projectId
      : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-2xl text-foreground tracking-tight">
        <ClipboardCheck
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 break-words">{title}</span>
      </h2>
      {projectId && (
        <Button
          variant="outline"
          size="xs"
          render={
            <Link
              to="/dashboard/workspace/$workspaceId/project/$projectId/test-cases"
              params={{ workspaceId, projectId }}
              search={{ testCaseId }}
            />
          }
        >
          {t("notifications:inbox.openTestCase")}
          <ArrowUpRight />
        </Button>
      )}
    </div>
  );
}
