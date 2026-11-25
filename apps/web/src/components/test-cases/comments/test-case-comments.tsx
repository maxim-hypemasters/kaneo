import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useTestCaseComments } from "@/hooks/queries/test-case/use-test-case-comments";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { TestCaseCommentCard } from "./test-case-comment-card";
import { TestCaseCommentComposer } from "./test-case-comment-composer";

// The discussion under a test case: oldest comment first, then the box for a
// new one for members who may work on test cases.
export function TestCaseComments({
  testCaseId,
  projectId,
  className,
}: {
  testCaseId: string;
  projectId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const heading = useId();
  const { canUpdateTestCases } = useWorkspacePermission();
  const query = useTestCaseComments(projectId, testCaseId);
  const comments = query.data?.data;
  return (
    <section
      aria-labelledby={heading}
      className={cn("flex flex-col gap-3", className)}
    >
      <h3 id={heading} className="font-medium text-sm">
        {t("tasks:testCases.comments.title")}
      </h3>
      {comments ? (
        comments.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li key={comment.id}>
                <TestCaseCommentCard comment={comment} projectId={projectId} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("tasks:testCases.comments.empty")}
          </p>
        )
      ) : query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          <p>{t("tasks:testCases.comments.loadError")}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            {t("common:error.tryAgain")}
          </Button>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground text-sm">
          {t("tasks:testCases.comments.loading")}
        </p>
      )}
      {canUpdateTestCases() && (
        <TestCaseCommentComposer
          testCaseId={testCaseId}
          projectId={projectId}
        />
      )}
    </section>
  );
}
