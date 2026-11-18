import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type { LinkChoice } from "./link-choice";
import { TestCaseDialog } from "./test-case-dialog";

export function NewTestCaseButton({
  projectId,
  initialMilestone,
  initialBug,
  variant = "default",
}: {
  projectId: string;
  initialMilestone?: LinkChoice;
  initialBug?: LinkChoice;
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
          initialMilestone={initialMilestone}
          initialBug={initialBug}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
