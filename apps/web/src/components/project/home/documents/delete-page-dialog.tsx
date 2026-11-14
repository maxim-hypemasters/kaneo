import { useTranslation } from "react-i18next";
import { WorkspaceDeleteDialog } from "@/components/task/features/workspace/workspace-delete-dialog";

// Deleting a page deletes its sub-pages too, so the count is spelled out.
export function DeletePageDialog({
  title,
  subPageCount,
  open,
  pending,
  failed,
  onOpenChange,
  onConfirm,
}: {
  title: string;
  subPageCount: number;
  open: boolean;
  pending: boolean;
  failed: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("tasks:projectHome.documents.delete")}
      description={
        subPageCount > 0
          ? t("tasks:projectHome.documents.deleteConfirmWithSubPages", {
              title,
              count: subPageCount,
            })
          : t("tasks:projectHome.documents.deleteConfirm", { title })
      }
      pending={pending}
      failed={failed}
      onConfirm={onConfirm}
    />
  );
}
