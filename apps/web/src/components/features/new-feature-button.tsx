import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import { Button } from "@/components/ui/button";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export function NewFeatureButton({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { canWorkItem } = useWorkspacePermission();
  const [open, setOpen] = useState(false);

  if (!canWorkItem("feature", "create")) return null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        {t("tasks:createMenu.newFeature")}
      </Button>
      {open && (
        <CreateTaskModal
          open
          type="feature"
          projectId={projectId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
