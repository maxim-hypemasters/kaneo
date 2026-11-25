import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteTestCase } from "@/hooks/mutations/test-case/use-delete-test-case";

export function DeleteTestCaseDialog({
  projectId,
  testCaseId,
  open,
  onOpenChange,
  onDeleted,
}: {
  projectId: string;
  testCaseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const remove = useDeleteTestCase(projectId);
  const [failed, setFailed] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!remove.isPending) {
          setFailed(false);
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("tasks:testCases.deleteTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("tasks:testCases.deleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="px-6 text-sm text-destructive-foreground">
            {t("tasks:testCases.deleteError")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogClose
            render={
              <Button variant="outline" disabled={remove.isPending}>
                {t("common:actions.cancel")}
              </Button>
            }
          />
          <Button
            variant="destructive"
            disabled={remove.isPending}
            aria-busy={remove.isPending}
            onClick={async () => {
              setFailed(false);
              try {
                await remove.mutateAsync(testCaseId);
                onOpenChange(false);
                onDeleted();
              } catch {
                setFailed(true);
              }
            }}
          >
            {t("tasks:testCases.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
