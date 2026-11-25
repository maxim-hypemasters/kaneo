import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { DeleteTestCaseDialog } from "./delete-test-case-dialog";

export function TestCaseDeleteButton({
  projectId,
  testCaseId,
  onDeleted,
}: {
  projectId: string;
  testCaseId: string;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { canDeleteTestCases } = useWorkspacePermission();
  const [confirming, setConfirming] = useState(false);
  if (!canDeleteTestCases()) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" />
        {t("tasks:testCases.delete")}
      </Button>
      <DeleteTestCaseDialog
        projectId={projectId}
        testCaseId={testCaseId}
        open={confirming}
        onOpenChange={setConfirming}
        onDeleted={onDeleted}
      />
    </>
  );
}
