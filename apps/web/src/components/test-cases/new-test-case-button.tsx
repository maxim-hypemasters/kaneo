import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { TestCaseDialog } from "./test-case-dialog";

export function NewTestCaseButton({
  projectId,
  initialMilestoneId,
  initialBugId,
  variant = "default",
}: {
  projectId: string;
  initialMilestoneId?: string | null;
  initialBugId?: string | null;
  variant?: "default" | "ghost";
}) {
  const { t } = useTranslation();
  const { canCreateTestCases } = useWorkspacePermission();
  const [open, setOpen] = useState(false);
  if (!canCreateTestCases()) return null;
  return (
    <>
      <Button
        size="sm"
        variant={variant}
        aria-label={variant === "ghost" ? t("tasks:testCases.add") : undefined}
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" />
        {variant === "default" && t("tasks:testCases.new")}
      </Button>
      {open && (
        <TestCaseDialog
          projectId={projectId}
          initialMilestoneId={initialMilestoneId}
          initialBugId={initialBugId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
